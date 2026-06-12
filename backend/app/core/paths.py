"""路径工具。"""
import re
from pathlib import Path, PureWindowsPath


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
    跨平台兼容：Windows 路径（E:\\...\\projects\\<id>\\...）也走 PureWindowsPath 兜底。
    """
    try:
        rel = file_path.resolve().relative_to(projects_root.resolve())
    except (ValueError, OSError):
        # 跨虚拟盘符 / 文件不存在 → 走 PureWindowsPath parts 兜底
        parts = PureWindowsPath(str(file_path)).parts
        root_parts = PureWindowsPath(str(projects_root)).parts
        for i, p in enumerate(parts):
            if p == root_parts[-1] and i + 1 < len(parts):
                return parts[i + 1]
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


# 修 B-03 / C-1 / C-2：统一文件路径解析
# 之前分散在 routers/files.py（preview/download/delete）和 services/settlement_builder.py
# 现在一处真理。所有"File 记录 → 运行时绝对路径"都走它。
def resolve_file_path(
    original_path: str | None,
    *,
    item_seq: int | None = None,
    item_name: str | None = None,
    project_id: str | None = None,
    projects_root: Path | None = None,
    pdf_path: str | None = None,
    prefer_pdf: bool = False,
    rglob_cap: int = 50,
) -> Path | None:
    """解析 File 记录的运行时绝对路径。返回 None 表示找不到。

    优先级（prefer_pdf=True 时先看 pdf_path）：
    1) pdf_path（合并 PDF）— 运行时绝对路径
    2) original_path 已是绝对路径且存在 — 兼容历史数据
    3) 项目内相对路径 — 标准形态（'01_xxx/foo.pdf' / '_unclaimed/bar.pdf' / 'baz.pdf'）
    4) 跨平台兜底（PureWindowsPath.basename + rglob，受 rglob_cap 限制）

    参数：
        original_path: DB 存的路径（项目相对 或 历史绝对）
        item_seq/item_name: 有归属的文件用
        project_id: 从孤儿路径推断（用 project_id_from_path）
        projects_root: PROJECTS_DIR（默认 None 时懒加载 settings.PROJECTS_DIR）
        pdf_path: 合并后的 PDF 绝对路径（可选）
        prefer_pdf: True 时优先用 pdf_path
        rglob_cap: rglob 兜底时最多遍历的路径数（防慢响应）
    """
    if projects_root is None:
        from app.config import settings
        projects_root = settings.PROJECTS_DIR

    # 0) prefer_pdf
    if prefer_pdf and pdf_path:
        p = Path(pdf_path)
        if p.exists():
            return p

    if not original_path:
        return None
    p = Path(original_path)

    # 1) 已是绝对路径且存在
    if p.is_absolute() and p.exists():
        return p

    # 2) 项目内相对路径（orphans 用 project_id 推断）
    candidates = []
    if project_id:
        # orphan 在项目根或 _unclaimed 子目录
        candidates.append(projects_root / project_id / original_path)
        candidates.append(projects_root / project_id / "_unclaimed" / p.name)
    if item_seq is not None and item_name:
        from app.core.template_loader import _sanitize_name
        folder = f"{item_seq:02d}_{_sanitize_name(item_name)}"
        candidates.append(projects_root / (project_id or "") / folder / original_path)
        candidates.append(projects_root / (project_id or "") / folder / p.name)
    for c in candidates:
        if c.exists():
            return c

    # 3) 跨平台兜底（PureWindowsPath.basename + rglob，受 cap 限制）
    if p.is_absolute() and project_id:
        basename = PureWindowsPath(original_path).name
        if basename:
            proj_root = projects_root / project_id
            if proj_root.exists():
                folder = None
                if item_seq is not None and item_name:
                    from app.core.template_loader import _sanitize_name
                    folder = f"{item_seq:02d}_{_sanitize_name(item_name)}"
                    c = proj_root / folder / basename
                    if c.exists():
                        return c
                count = 0
                for sub in proj_root.rglob(basename):
                    count += 1
                    if count > rglob_cap:
                        return None  # 太慢，放弃
                    return sub
    return None
