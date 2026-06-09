"""项目服务。"""
import json
from datetime import date
from pathlib import Path
from typing import List
from sqlalchemy.orm import Session

from app.config import settings
from app.core.template_loader import load_template_from_docx, _sanitize_name
from app.models import Project, Item
from app.schemas import ProjectProgress
from app.core.paths import safe_join


def get_or_load_template_items() -> list[dict]:
    """读取 master_template.json；不存在则解析 docx。"""
    p = settings.TEMPLATE_PATH
    if p.exists():
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["items"]
    # 兜底：解析 docx
    docx = settings.SOURCE_DOCX.resolve()
    if not docx.exists():
        raise RuntimeError(f"找不到源模版: {docx}")
    items = load_template_from_docx(docx)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "items": items}, f, ensure_ascii=False, indent=2)
    return items


def create_project(db: Session, payload: dict) -> Project:
    """创建项目 + 自动建 25 个 item + 25 个子文件夹。"""
    p = Project(**payload)
    db.add(p)
    db.flush()  # 拿到 p.id

    # 拉模版
    template_items = get_or_load_template_items()

    # 建子文件夹 + 入 item
    project_dir = safe_join(settings.PROJECTS_DIR, p.id)
    project_dir.mkdir(parents=True, exist_ok=True)
    for ti in template_items:
        seq = ti["seq"]
        folder_name = ti.get("folder_name") or _sanitize_name(ti["name"])
        sub = project_dir / f"{seq:02d}_{folder_name}"
        sub.mkdir(parents=True, exist_ok=True)

        item = Item(
            project_id=p.id,
            seq=seq,
            name=ti["name"],
            description=ti.get("description"),
            is_extension=False,
        )
        db.add(item)

    # _unclaimed 暂存区
    (project_dir / "_unclaimed").mkdir(parents=True, exist_ok=True)
    # 写 meta.json
    meta = {
        "id": p.id,
        "name": p.name,
        "deadline": p.deadline.isoformat(),
    }
    (project_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    db.commit()
    db.refresh(p)
    return p


def compute_progress(db: Session, project: Project) -> ProjectProgress:
    items = project.items
    total = len(items)
    return ProjectProgress(
        total=total,
        confirmed=sum(1 for i in items if i.status == "confirmed"),
        uploaded=sum(1 for i in items if i.status == "uploaded"),
        rejected=sum(1 for i in items if i.status == "rejected"),
        pending=sum(1 for i in items if i.status == "pending"),
    )


def days_to_deadline(deadline: date) -> int:
    return (deadline - date.today()).days
