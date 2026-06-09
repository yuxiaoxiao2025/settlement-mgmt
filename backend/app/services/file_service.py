"""文件服务：路径归属判断、入库。"""
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.core.paths import is_in_subfolder
from app.core.matching import match_best
from app.models import Item, File
from app.services.project_service import get_or_load_template_items


def ingest_path(db: Session, file_path: Path) -> Optional[File]:
    """文件落地处理：判断归属 + 入库 + 状态变更。

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
            .filter(File.original_path == str(file_path.resolve()))
            .first()
        )
        if existing:
            existing.filename = file_path.name
            existing.filesize = file_path.stat().st_size
            existing.uploaded_at = _now()
            existing.is_pdf = file_path.suffix.lower() == ".pdf"
            db.commit()
            return existing
        f = File(
            item_id="",  # orphan
            filename=file_path.name,
            original_path=str(file_path.resolve()),
            filesize=file_path.stat().st_size,
            is_pdf=file_path.suffix.lower() == ".pdf",
        )
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
    if existing:
        existing.filesize = file_path.stat().st_size
        existing.uploaded_at = _now()
        existing.is_pdf = file_path.suffix.lower() == ".pdf"
        existing.original_path = str(file_path.resolve())
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
        original_path=str(file_path.resolve()),
        filesize=file_path.stat().st_size,
        is_pdf=file_path.suffix.lower() == ".pdf",
        is_primary=len(target_item.files) == 0,  # 第一个文件自动 primary
    )
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
    abs_path = str(file_path.resolve())
    f = db.query(File).filter(File.original_path == abs_path).first()
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
