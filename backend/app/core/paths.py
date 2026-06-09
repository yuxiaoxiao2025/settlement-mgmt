"""路径工具。"""
import re
from pathlib import Path


def safe_join(base: Path, *parts: str) -> Path:
    """安全拼接路径，禁止跳出 base。

    Raises: ValueError if result is outside base.
    """
    base = base.resolve()
    target = (base.joinpath(*parts)).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise ValueError(f"路径越界: {target} 不在 {base} 内")
    return target


def project_id_from_path(file_path: Path, projects_root: Path) -> str | None:
    """从绝对路径中提取项目 ID。

    期望: projects_root/<project_id>/<seq>_<name>/<filename>
    """
    try:
        rel = file_path.resolve().relative_to(projects_root.resolve())
    except ValueError:
        return None
    parts = rel.parts
    if not parts:
        return None
    return parts[0]


def seq_from_subdir(subdir_name: str) -> int | None:
    """从子目录名提取序号。01_招标文件 → 1"""
    m = re.match(r'^(\d+)_', subdir_name)
    if m:
        return int(m.group(1))
    return None


def is_in_subfolder(file_path: Path, projects_root: Path) -> tuple[str | None, int | None]:
    """判断文件是否在某个资料子文件夹下。

    Returns: (project_id, seq) 或 (None, None)
    """
    try:
        rel = file_path.resolve().relative_to(projects_root.resolve())
    except ValueError:
        return None, None
    parts = rel.parts
    if len(parts) < 3:
        # projects_root/<project_id>/<filename> — 在项目根目录，不是子文件夹
        if len(parts) == 2:
            return parts[0], None
        return None, None
    return parts[0], seq_from_subdir(parts[1])
