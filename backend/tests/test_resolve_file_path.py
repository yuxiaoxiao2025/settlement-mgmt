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
