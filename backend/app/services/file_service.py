"""文件服务：路径归属判断、入库。"""
from pathlib import Path, PureWindowsPath
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.core.paths import is_in_subfolder, project_id_from_path
from app.core.matching import match_best
from app.models import Item, File
from app.services.pdf_converter import convert_to_pdf
from app.services.project_service import get_or_load_template_items


# 修 B-03：DB 存项目相对路径（不是运行时绝对路径）
# 跨平台移栽（Windows venv → Docker / 不同机器）不会失效
def _to_relative_path(project_id: str, file_path: Path) -> str:
    """把 file_path 转为项目内相对路径，存 DB 用。

    跨平台兼容：
    - Linux: /projects/{proj_id}/01_xxx/foo.pdf → "01_xxx/foo.pdf"
    - Windows: E:\\...\\{proj_id}\\01_xxx\\foo.pdf → "01_xxx/foo.pdf"
    - 已经在项目内（取相对）：保持原样
    - 完全在项目外：兜底返回 basename
    """
    project_root = settings.PROJECTS_DIR / project_id
    abs_path = file_path.resolve() if file_path.exists() else file_path
    try:
        rel = abs_path.relative_to(project_root)
        # 统一用正斜杠（跨平台兼容 — Windows 上 relative_to 会返回反斜杠）
        return str(rel).replace("\\", "/")
    except ValueError:
        pass
    # 跨平台兜底：按 Windows 路径前缀切
    from pathlib import PureWindowsPath
    proj_parts = PureWindowsPath(str(project_root)).parts
    abs_parts = PureWindowsPath(str(abs_path)).parts
    if len(abs_parts) >= len(proj_parts) and abs_parts[-len(proj_parts):] == proj_parts:
        return "/".join(abs_parts[-len(proj_parts) + len(proj_parts):])
    # 实在不行只取 basename
    return abs_path.name


def _try_convert_to_pdf(
    project_id: str,
    item_seq: Optional[int],
    item_name: str,
    src: Path,
) -> Optional[str]:
    """尝试把非 PDF 文件转成 PDF 存到 .pdfs/<seq>_<name>/。

    WPS 不可用或转码失败时返回 None，原文件仍正常入库（is_pdf=False）。
    """
    if src.suffix.lower() == ".pdf":
        return None
    pdfs_root = settings.PROJECTS_DIR / project_id / ".pdfs"
    folder_name = f"{item_seq:02d}_{_safe_name(item_name)}" if item_seq is not None else "_unclaimed"
    dst_dir = pdfs_root / folder_name
    out = convert_to_pdf(src, dst_dir)
    return str(out) if out else None


def _safe_name(name: str) -> str:
    """清理文件夹名中的非法字符。"""
    bad = '<>:"/\\|?*'
    return "".join("_" if c in bad else c for c in name).strip() or "unnamed"


def ingest_path(db: Session, file_path: Path) -> Optional[File]:
    """文件落地处理：判断归属 + 入库 + 状态变更 + 非 PDF 转码。

    Returns: File 对象（已入库）或 None（无法归属）
    """
    if not file_path.exists() or not file_path.is_file():
        return None

    project_id, seq = is_in_subfolder(file_path, settings.PROJECTS_DIR)
    if not project_id:
        return None

    # 排除项目根目录的元文件
    if file_path.name in ("meta.json",):
        return None

    project_items = (
        db.query(Item).filter(Item.project_id == project_id).all()
    )

    target_item: Optional[Item] = None

    # 1) 子文件夹归属（最准）
    if seq is not None:
        for it in project_items:
            if it.seq == seq:
                target_item = it
                break

    # 2) 项目根目录 → 模糊匹配
    if not target_item and seq is None:
        candidates = [
            {"seq": it.seq, "name": it.name} for it in project_items
        ]
        best = match_best(file_path.name, candidates, threshold=0.5)
        if best:
            for it in project_items:
                if it.seq == best["seq"]:
                    target_item = it
                    break

    # 3) 都不命中 → _unclaimed 区
    if not target_item:
        # 创建 unclaimed file 记录（item_id 留空）
        unclaimed_dir = settings.PROJECTS_DIR / project_id / "_unclaimed"
        unclaimed_dir.mkdir(parents=True, exist_ok=True)
        # 同名覆盖
        existing = (
            db.query(File)
            .filter(File.original_path == _to_relative_path(project_id, file_path))
            .first()
        )
        is_pdf = file_path.suffix.lower() == ".pdf"
        if existing:
            existing.filename = file_path.name
            existing.filesize = file_path.stat().st_size
            existing.uploaded_at = _now()
            existing.is_pdf = is_pdf
            # unclaimed 文件也尝试转码（放到 _unclaimed 子目录）
            if not is_pdf:
                pdf_path = _try_convert_to_pdf(project_id, None, "_unclaimed", file_path)
                if pdf_path:
                    existing.pdf_path = pdf_path
            db.commit()
            return existing
        f = File(
            item_id="",  # orphan
            # 修 I-4: 用 item_id_orphan 列存 project_id（list_items 不再走磁盘）
            item_id_orphan=project_id,
            filename=file_path.name,
            original_path=_to_relative_path(project_id, file_path),
            filesize=file_path.stat().st_size,
            is_pdf=is_pdf,
        )
        if not is_pdf:
            pdf_path = _try_convert_to_pdf(project_id, None, "_unclaimed", file_path)
            if pdf_path:
                f.pdf_path = pdf_path
        db.add(f)
        db.commit()
        db.refresh(f)
        return f

    # 4) 有归属：upsert
    existing = (
        db.query(File)
        .filter(File.item_id == target_item.id, File.filename == file_path.name)
        .first()
    )
    is_pdf = file_path.suffix.lower() == ".pdf"
    if existing:
        existing.filesize = file_path.stat().st_size
        existing.uploaded_at = _now()
        existing.is_pdf = is_pdf
        existing.original_path = _to_relative_path(project_id, file_path)
        # 重新尝试转码（覆盖原 PDF；如有 .pdfs 旧文件保留为历史）
        if not is_pdf:
            pdf_path = _try_convert_to_pdf(
                project_id, target_item.seq, target_item.name, file_path
            )
            if pdf_path:
                existing.pdf_path = pdf_path
        # 状态机
        if target_item.status == "pending":
            target_item.status = "uploaded"
        elif target_item.status == "rejected":
            target_item.status = "uploaded"
            target_item.rejected_note = None
        db.commit()
        return existing

    f = File(
        item_id=target_item.id,
        filename=file_path.name,
        original_path=_to_relative_path(project_id, file_path),
        filesize=file_path.stat().st_size,
        is_pdf=is_pdf,
        is_primary=len(target_item.files) == 0,  # 第一个文件自动 primary
    )
    if not is_pdf:
        pdf_path = _try_convert_to_pdf(
            project_id, target_item.seq, target_item.name, file_path
        )
        if pdf_path:
            f.pdf_path = pdf_path
    db.add(f)
    # 状态机
    if target_item.status == "pending":
        target_item.status = "uploaded"
    elif target_item.status == "rejected":
        target_item.status = "uploaded"
        target_item.rejected_note = None
    db.commit()
    db.refresh(f)
    return f


def remove_path(db: Session, file_path: Path) -> None:
    """文件删除：同步从 files 表移除，可能回退 item 状态。"""
    # 修 B-03 + I-1：用 core 的 project_id_from_path（settings.PROJECTS_DIR 显式传）
    project_id = project_id_from_path(file_path, settings.PROJECTS_DIR)
    if project_id:
        rel_path = _to_relative_path(project_id, file_path)
    else:
        # 兜底：完全在项目外（如 _unclaimed 跨项目）— 用原绝对路径
        rel_path = str(file_path.resolve())
    f = db.query(File).filter(File.original_path == rel_path).first()
    if not f:
        return
    item = db.query(Item).filter(Item.id == f.item_id).first() if f.item_id else None
    db.delete(f)
    db.flush()  # 让 db.delete(f) 反映到 item.files
    if item is not None:
        # 重新查 files 数（避免 relationship 缓存）
        remaining = db.query(File).filter(File.item_id == item.id).count()
        if remaining == 0:
            item.status = "pending"
    db.commit()


def _now():
    from datetime import datetime
    return datetime.utcnow()
