"""修 review C-1：orphan 文件 preview/download/delete 测试。

Phase 5 reviewer 找到：T-06 后 orphan original_path 是 basename（如 "foo.pdf"），
旧 _resolve_file_path orphan 分支只检查 is_absolute() + exists()，返 None →
preview/download/delete 全 404/失败。修：app/core/paths.py:resolve_file_path
统一处理所有形态（orphan basename / _unclaimed 子目录 / 归属相对 / 归属绝对 / 历史绝对）。
"""
import os
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")
os.environ.setdefault("SITE_VERIFICATION_CODE", "jrvUPovFZS8")
os.environ.setdefault("JWT_SECRET", "x" * 64)

import sys
from datetime import date
from pathlib import Path
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import File, Item, Project
from app.core.paths import resolve_file_path


@pytest.fixture
def env(tmp_path, monkeypatch):
    """tmp_path/proj/01_xxx/foo.pdf + proj/_unclaimed/bar.pdf + proj/orphan_root.pdf"""
    from app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)
    proj = tmp_path / "p1"
    proj.mkdir()
    (proj / "01_xxx").mkdir()
    (proj / "01_xxx" / "foo.pdf").write_text("x")
    (proj / "_unclaimed").mkdir()
    (proj / "_unclaimed" / "bar.pdf").write_text("x")
    (proj / "orphan_root.pdf").write_text("x")
    return tmp_path


def test_resolve_orphan_in_root(env):
    """T-06 后 orphan 在项目根目录，original_path = 'orphan_root.pdf'。"""
    p = resolve_file_path("orphan_root.pdf", project_id="p1", projects_root=env)
    assert p is not None
    assert p.exists()
    assert p.name == "orphan_root.pdf"


def test_resolve_orphan_in_unclaimed(env):
    """T-06 后 orphan 在 _unclaimed 子目录，original_path = 'bar.pdf'。"""
    p = resolve_file_path("bar.pdf", project_id="p1", projects_root=env)
    assert p is not None
    assert p.exists()
    assert "unclaimed" in str(p)


def test_resolve_owned_relative(env):
    """归属文件 original_path = '01_xxx/foo.pdf'（项目相对）。"""
    p = resolve_file_path(
        "01_xxx/foo.pdf",
        item_seq=1, item_name="xxx", project_id="p1",
        projects_root=env,
    )
    assert p is not None
    assert p.exists()
    assert p.name == "foo.pdf"


def test_resolve_prefer_pdf_orphan(env):
    """preview 时 prefer_pdf=True 走 pdf_path 优先；orphan 无 pdf_path 时仍解析 original_path。"""
    p = resolve_file_path(
        "bar.pdf",
        project_id="p1", projects_root=env,
        prefer_pdf=True,  # 但 pdf_path=None
    )
    assert p is not None
    assert p.exists()


def test_resolve_nonexistent_returns_none(env):
    """不存在的文件返 None（不抛异常）。"""
    p = resolve_file_path(
        "nonexistent.pdf",
        item_seq=1, item_name="xxx", project_id="p1",
        projects_root=env,
    )
    assert p is None


def test_resolve_orphan_no_project_id_scan_all_projects(env):
    """修 C-1 Round 2：no project_id 时扫描 PROJECTS_DIR 全部项目找 basename。

    模拟 router 调用：f.item=None, original_path='bar.pdf' (T-06 basename)
    → project_id_from_path 返 None → 兜底走 PROJECTS_DIR.rglob
    """
    p = resolve_file_path("bar.pdf", project_id=None, projects_root=env)
    assert p is not None, "should find via PROJECTS_DIR.rglob scan"
    assert p.exists()
    assert "unclaimed" in str(p) or p.name == "bar.pdf"


def test_resolve_orphan_no_project_id_returns_none_if_not_in_any_project(tmp_path, monkeypatch):
    """无 project_id + 文件不存在于任何项目 → 返 None。"""
    from app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)
    # tmp_path 是空目录
    p = resolve_file_path("ghost.pdf", project_id=None, projects_root=tmp_path)
    assert p is None


def test_resolve_orphan_basename_collision_returns_none(tmp_path, monkeypatch):
    """修 D-2：多项目同 basename 冲突 → 返 None（不静默返错项目）。"""
    from app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)
    p1 = tmp_path / "p1"
    p2 = tmp_path / "p2"
    p1.mkdir()
    p2.mkdir()
    (p1 / "_unclaimed" / "dup.pdf").parent.mkdir(parents=True, exist_ok=True)
    (p1 / "_unclaimed" / "dup.pdf").write_text("from p1")
    (p2 / "_unclaimed" / "dup.pdf").parent.mkdir(parents=True, exist_ok=True)
    (p2 / "_unclaimed" / "dup.pdf").write_text("from p2")
    # 两个项目都有 dup.pdf → 冲突，返 None
    p = resolve_file_path("dup.pdf", project_id=None, projects_root=tmp_path)
    assert p is None


def test_resolve_orphan_rglob_cap_protection(tmp_path, monkeypatch):
    """修 D-1：rglob_cap 真正生效 — 超过 cap 的 match 集合返 None。"""
    from app.config import settings
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)
    # 创建 3 个项目，每个有同名文件
    for i in range(3):
        proj = tmp_path / f"p{i}"
        proj.mkdir()
        (proj / "ghost.pdf").write_text("x")
    # 用 cap=2 测试 — 3 个 match 超过 cap
    p = resolve_file_path("ghost.pdf", project_id=None, projects_root=tmp_path, rglob_cap=2)
    assert p is None
