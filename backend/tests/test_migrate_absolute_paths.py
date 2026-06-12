"""迁移脚本 dry-run 单元测试（不连真 DB）。

用 in-memory sqlite 验证 migrate() 行为：
- absolute path → relative path（应用 --apply 改）
- 已 relative path → 不动
- orphan (item_id="") → 不动
"""
import os
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")
os.environ.setdefault("SITE_VERIFICATION_CODE", "jrvUPovFZS8")
os.environ.setdefault("JWT_SECRET", "x" * 64)

import sys
from pathlib import Path
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 让 scripts.migrate_absolute_paths 可导入
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base  # noqa: E402
from app.models import File, Item, Project  # noqa: E402
from scripts.migrate_absolute_paths import migrate  # noqa: E402


@pytest.fixture
def in_memory_db(tmp_path, monkeypatch):
    """in-memory DB + 一个项目 + 一个 item，模拟历史 Windows 路径数据。"""
    db_file = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)

    from app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)

    proj_id = "proj-migrate-1"
    from datetime import date
    proj = Project(id=proj_id, name="迁移测试项目", deadline=date(2026, 12, 31))
    item = Item(id="item-1", project_id=proj_id, seq=1, name="结算书")
    # 关键：absolute path 必须在 PROJECTS_DIR/proj_id/ 之下
    abs_path = str((tmp_path / proj_id / "01_结算书" / "foo.pdf").resolve())
    f = File(
        item_id="item-1",
        filename="foo.pdf",
        original_path=abs_path,  # 历史 Windows 绝对路径
        is_pdf=True,
    )
    orphan = File(
        item_id="",
        filename="orphan.pdf",
        original_path=str((tmp_path / proj_id / "orphan.pdf").resolve()),
        is_pdf=True,
    )
    with SessionLocal() as s:
        s.add(proj)
        s.add(item)
        s.add(f)
        s.add(orphan)
        s.commit()

    # monkeypatch SessionLocal
    import scripts.migrate_absolute_paths as mod
    monkeypatch.setattr(mod, "SessionLocal", SessionLocal)

    yield SessionLocal


def test_dry_run_does_not_modify(in_memory_db):
    """dry-run 应当不改库。"""
    changed, total = migrate(dry_run=True)
    assert changed == 1
    assert total == 2  # 1 个有归属 + 1 个 orphan
    with in_memory_db() as s:
        f = s.query(File).filter(File.filename == "foo.pdf").first()
        # 没改 — 仍是原绝对路径
        assert f.original_path.endswith("foo.pdf")
        assert Path(f.original_path).is_absolute()
        orphan = s.query(File).filter(File.filename == "orphan.pdf").first()
        assert orphan.original_path.endswith("orphan.pdf")


def test_apply_modifies_only_belonging_files(in_memory_db):
    """--apply 改有归属的不动 orphan。"""
    changed, total = migrate(dry_run=False)
    assert changed == 1
    with in_memory_db() as s:
        f = s.query(File).filter(File.filename == "foo.pdf").first()
        # 改成了项目相对
        assert f.original_path == "01_结算书/foo.pdf"
        assert not Path(f.original_path).is_absolute()
        orphan = s.query(File).filter(File.filename == "orphan.pdf").first()
        # orphan 不动（仍绝对）
        assert orphan.original_path.endswith("orphan.pdf")


def test_skip_already_relative_paths(in_memory_db, tmp_path, monkeypatch):
    """修 C-3：已项目相对路径不处理（避免 _to_relative_path 兜底返 basename 丢子目录）。"""
    from app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)

    with in_memory_db() as s:
        rel_file = File(
            item_id="item-1",
            filename="rel.pdf",
            original_path="01_结算书/rel.pdf",  # 已相对
            is_pdf=True,
        )
        s.add(rel_file)
        s.commit()
        rel_file_id = rel_file.id

    # dry-run：跳过已相对路径
    changed, total = migrate(dry_run=True)
    # changed 仍是 0（之前 item-1/foo.pdf 已迁移过 + rel.pdf 跳过）
    # 验证 rel_file 没被改
    with in_memory_db() as s:
        rf = s.query(File).filter(File.id == rel_file_id).first()
        assert rf.original_path == "01_结算书/rel.pdf"  # 没动
