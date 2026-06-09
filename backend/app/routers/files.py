"""文件路由：预览、下载、删除、手动刷新。"""
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import File, Item
from app.schemas import FileInItem
from app.services import file_service

router = APIRouter(tags=["files"])


@router.get("/api/items/{item_id}/files", response_model=list[FileInItem])
def list_files(item_id: str, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "item 不存在")
    return [
        FileInItem(
            id=f.id, filename=f.filename, filesize=f.filesize,
            is_pdf=f.is_pdf, is_primary=f.is_primary, uploaded_at=f.uploaded_at,
        )
        for f in item.files
    ]


@router.post("/api/items/{item_id}/refresh")
def refresh_item(item_id: str, db: Session = Depends(get_db)):
    """手动扫描此 item 对应的子文件夹。"""
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "item 不存在")
    # 找子文件夹
    from app.config import settings
    from app.core.paths import safe_join
    from app.core.template_loader import _sanitize_name

    project_dir = safe_join(settings.PROJECTS_DIR, item.project_id)
    folder_name = _sanitize_name(item.name)
    sub = project_dir / f"{item.seq:02d}_{folder_name}"
    if not sub.exists():
        return {"scanned": 0, "added": 0}
    added = 0
    for f in sub.iterdir():
        if f.is_file():
            file_service.ingest_path(db, f)
            added += 1
    return {"scanned": 1, "added": added}


@router.get("/api/files/{file_id}/preview")
def preview_file(file_id: str, db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(404, "文件不存在")
    p = Path(f.pdf_path or f.original_path)
    if not p.exists():
        raise HTTPException(404, "物理文件不存在")
    return FileResponse(str(p), filename=f.filename, media_type="application/pdf" if f.is_pdf else "application/octet-stream")


@router.get("/api/files/{file_id}/download")
def download_file(file_id: str, db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(404, "文件不存在")
    p = Path(f.original_path)
    if not p.exists():
        raise HTTPException(404, "物理文件不存在")
    return FileResponse(str(p), filename=f.filename, content_disposition_type="attachment")


@router.delete("/api/files/{file_id}", status_code=204)
def delete_file(file_id: str, db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(404, "文件不存在")
    p = Path(f.original_path)
    file_service.remove_path(db, p)
    # 物理文件不删，留给用户
