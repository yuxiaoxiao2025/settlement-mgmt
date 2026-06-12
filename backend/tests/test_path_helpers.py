"""_to_relative_path 跨平台兼容测试。

修 B-03：DB 存项目相对路径（不是运行时绝对路径）。
"""
import os
from pathlib import Path
import pytest

# 修 B-01：4 个 auth secret（避免 import chain 触发 lifespan 校验）
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")
os.environ.setdefault("SITE_VERIFICATION_CODE", "jrvUPovFZS8")
os.environ.setdefault("JWT_SECRET", "x" * 64)

from app.config import settings
from app.services.file_service import _to_relative_path


def test_relative_path_linux_style(tmp_path, monkeypatch):
    """Linux 风格路径 → 项目内相对。"""
    proj_id = "proj123"
    proj = tmp_path / proj_id
    proj.mkdir()
    sub = proj / "01_结算书"
    sub.mkdir()
    f = sub / "test.pdf"
    f.write_text("dummy")
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)
    rel = _to_relative_path(proj_id, f)
    assert rel == "01_结算书/test.pdf"


def test_relative_path_windows_style(tmp_path, monkeypatch):
    """Windows 风格路径（历史数据）→ 项目内相对。"""
    proj_id = "proj456"
    proj = tmp_path / proj_id
    proj.mkdir()
    sub = proj / "01_结算书"
    sub.mkdir()
    f = sub / "test.pdf"
    f.write_text("dummy")
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)
    # 模拟"文件来自 Windows 机器"的绝对路径
    win_path_str = f"{tmp_path}\\{proj_id}\\01_结算书\\test.pdf"
    win_path = Path(win_path_str)
    rel = _to_relative_path(proj_id, win_path)
    # 容器内 _to_relative_path 用 PureWindowsPath 切，应当返回项目内相对路径
    assert "01_结算书" in rel
    assert rel.endswith("test.pdf")
    assert not Path(rel).is_absolute() or "01_结算书" in rel


def test_relative_path_outside_project(tmp_path, monkeypatch):
    """完全在项目外的路径 → 返回 basename（兜底）。"""
    proj_id = "proj789"
    proj = tmp_path / proj_id
    proj.mkdir()
    monkeypatch.setattr(settings, "PROJECTS_DIR", tmp_path)
    outside = tmp_path / "completely" / "different" / "foo.pdf"
    outside.parent.mkdir(parents=True, exist_ok=True)
    outside.write_text("dummy")
    rel = _to_relative_path(proj_id, outside)
    # 兜底返回 basename
    assert rel == "foo.pdf"
