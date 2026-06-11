"""资料项服务（状态机）。"""
import json
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.core.paths import safe_join
from app.core.template_loader import _sanitize_name
from app.models import Item, File
from app.services.project_service import get_or_load_template_items


VALID_TRANSITIONS = {
    "pending": {"uploaded", "pending"},
    "uploaded": {"uploaded", "confirmed", "rejected", "pending"},
    "rejected": {"rejected", "uploaded", "pending"},
    "confirmed": {"confirmed", "pending"},  # 仅删除文件可回退
}


def can_transition(current: str, target: str) -> bool:
    return target in VALID_TRANSITIONS.get(current, set())


def add_item(
    db: Session, project_id: str, name: str, description: Optional[str] = None
) -> tuple[Item, bool]:
    """新增项目级扩展项。

    Returns: (item, promote_available)
    promote_available: True 表示该项不在 master_template 里，可提示用户推广
    """
    # 取下一个 seq
    last = (
        db.query(Item)
        .filter(Item.project_id == project_id)
        .order_by(Item.seq.desc())
        .first()
    )
    next_seq = (last.seq + 1) if last else 1

    # 建子文件夹
    folder_name = _sanitize_name(name)
    project_dir = safe_join(settings.PROJECTS_DIR, project_id)
    sub = project_dir / f"{next_seq:02d}_{folder_name}"
    sub.mkdir(parents=True, exist_ok=True)

    item = Item(
        project_id=project_id,
        seq=next_seq,
        name=name,
        description=description,
        is_extension=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # 检查是否可推广
    template_items = get_or_load_template_items()
    exists = any(_sanitize_name(t["name"]) == folder_name for t in template_items)
    return item, not exists


def confirm_item(
    db: Session, item_id: str, primary_file_id: Optional[str] = None
) -> Item:
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise LookupError("item 不存在")
    if item.status not in ("uploaded", "rejected"):
        raise ValueError(f"当前状态 {item.status} 不允许确认（需 uploaded 或 rejected）")
    if not item.files:
        raise ValueError("无文件，无法确认")

    from datetime import datetime
    item.status = "confirmed"
    item.confirmed_at = datetime.utcnow()
    item.rejected_note = None

    # 设置主文件
    if primary_file_id:
        for f in item.files:
            f.is_primary = (f.id == primary_file_id)
    else:
        # 默认第一个 PDF 是主文件
        pdf_files = [f for f in item.files if f.is_pdf]
        for f in item.files:
            f.is_primary = (f in (pdf_files or item.files)[:1])
    db.commit()
    db.refresh(item)
    return item


def reject_item(db: Session, item_id: str, note: str) -> Item:
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise LookupError("item 不存在")
    if item.status not in ("uploaded", "rejected"):
        raise ValueError(f"当前状态 {item.status} 不允许驳回（需 uploaded 或 rejected）")
    item.status = "rejected"
    item.rejected_note = note
    db.commit()
    db.refresh(item)
    return item


def reset_item(db: Session, item_id: str) -> Item:
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise LookupError("item 不存在")
    item.status = "pending"
    item.rejected_note = None
    item.confirmed_at = None
    db.commit()
    db.refresh(item)
    return item


def promote_to_template(name: str, description: Optional[str] = None) -> dict:
    """把新增项写入 master_template.json（模版成长）。"""
    template_items = get_or_load_template_items()
    folder_name = _sanitize_name(name)
    # 读出现有 version（必须读，因为写盘前 data["version"] 才是真实的）
    with open(settings.TEMPLATE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    current_version = data.get("version", 1)
    current_total = len(data["items"])

    # 已存在 → 不重复添加；返回的 new_version 反映当前版本（前端 toast 不变）
    if any(_sanitize_name(t["name"]) == folder_name for t in template_items):
        return {
            "added": False,
            "new_version": current_version,
            "total_items": current_total,
        }

    next_seq = max((t["seq"] for t in template_items), default=0) + 1
    template_items.append({
        "seq": next_seq,
        "name": name,
        "description": description,
        "is_default": False,
        "folder_name": folder_name,
    })

    data["items"] = template_items
    data["version"] = current_version + 1
    with open(settings.TEMPLATE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {
        "added": True,
        "new_version": data["version"],
        "total_items": len(template_items),
    }
