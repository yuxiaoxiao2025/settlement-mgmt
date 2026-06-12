"""文件路由：预览、下载、删除、手动刷新、**上传**（v0.3.1+）。"""
import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.paths import safe_join, resolve_file_path, project_id_from_path
from app.core.template_loader import _sanitize_name
from app.database import get_db
from app.models import File, Item
from app.schemas import FileInItem
from app.services import file_service
from app.services.file_service import ingest_path

router = APIRouter(tags=["files"])


# 修 C-1 / C-2：从 File 记录解析运行时绝对路径的统一入口
# 委托给 app.core.paths.resolve_file_path（shared by routers/files.py + services/settlement_builder.py）
def _resolve_file_path(f: "File", prefer_pdf: bool = False) -> Path | None:
    # review Round 6 D-4: orphan File 优先用 item_id_orphan (DB 存了真 project_id)
    # 避免 project_id_from_path 对相对 basename 返 None → rglob 兜底
    proj_id = (
        f.item.project_id if f.item
        else (f.item_id_orphan or project_id_from_path(Path(f.original_path), settings.PROJECTS_DIR))
    )
    return resolve_file_path(
        f.original_path,
        item_seq=f.item.seq if f.item else None,
        item_name=f.item.name if f.item else None,
        project_id=proj_id,
        pdf_path=f.pdf_path,
        prefer_pdf=prefer_pdf,
    )


# 上传大小上限：200MB / 文件（PDF 合并常见大文件；够用）
MAX_UPLOAD_BYTES = 200 * 1024 * 1024

# 允许的扩展名（白名单 — 防上传可执行文件）
_ALLOWED_EXTS = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
    ".txt", ".md", ".csv",
    ".zip", ".rar", ".7z",
}


def _validate_upload(filename: str, content_length: int | None) -> None:
    """校验文件名 + 大小。"""
    if not filename:
        raise HTTPException(400, "filename missing")
    # 防路径穿越：拒绝含 .. 或 / 或 \ 的文件名
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "invalid filename")
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(400, f"file type not allowed: {ext or '(none)'}")
    if content_length is not None and content_length > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"file too large (> {MAX_UPLOAD_BYTES // 1024 // 1024}MB)")


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
    p = _resolve_file_path(f, prefer_pdf=True)
    if not p or not p.exists():
        raise HTTPException(404, "物理文件不存在")
    # content_disposition_type="inline" 让浏览器内置阅读器直接打开 PDF，而不是下载
    # 非 PDF 文件（docx/xlsx）回退为下载，因为浏览器无法 inline 渲染
    if f.is_pdf:
        return FileResponse(
            str(p),
            filename=f.filename,
            media_type="application/pdf",
            content_disposition_type="inline",
        )
    return FileResponse(
        str(p),
        filename=f.filename,
        media_type="application/octet-stream",
    )


@router.get("/api/files/{file_id}/download")
def download_file(file_id: str, db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(404, "文件不存在")
    p = _resolve_file_path(f)
    if not p or not p.exists():
        raise HTTPException(404, "物理文件不存在")
    return FileResponse(str(p), filename=f.filename, content_disposition_type="attachment")


@router.delete("/api/files/{file_id}", status_code=204)
def delete_file(file_id: str, db: Session = Depends(get_db)):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(404, "文件不存在")
    p = _resolve_file_path(f)
    if p is not None:
        file_service.remove_path(db, p)
    # 物理文件不删，留给用户
    return None


# ── 上传（v0.3.1+：浏览器拖拽 → 后端直接落到子文件夹） ──


@router.post("/api/items/{item_id}/upload", status_code=201)
async def upload_to_item(
    item_id: str,
    file: UploadFile = FastFile(...),
    db: Session = Depends(get_db),
):
    """上传一个文件到指定 item 的子文件夹。

    - 文件名走白名单 + 路径穿越检查
    - 落地后调 ingest_path 入库（watcher 也会捕获，这里双保险）
    - 重名自动加 UUID 后缀，不覆盖
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "item 不存在")

    # 校验
    raw_name = file.filename or ""
    _validate_upload(raw_name, getattr(file, "size", None))

    # 计算落地路径：projects/<project_id>/<seq>_<sanitized_name>/
    project_dir = safe_join(settings.PROJECTS_DIR, item.project_id)
    folder_name = f"{item.seq:02d}_{_sanitize_name(item.name)}"
    target_dir = project_dir / folder_name
    if not target_dir.exists():
        raise HTTPException(404, f"目标文件夹不存在: {folder_name}")

    # 落地（防覆盖）
    original = Path(raw_name).name  # 已经过 validate，含 .. 会拒绝
    target = target_dir / original
    if target.exists():
        stem, suffix = target.stem, target.suffix
        target = target_dir / f"{stem}.{uuid.uuid4().hex[:8]}{suffix}"

    # 流式写盘（避免大文件一次性进内存）
    try:
        with target.open("wb") as out:
            shutil.copyfileobj(file.file, out)
    finally:
        file.file.close()

    # 入库（watcher 同时也会捕获，这里立即 ingest 让前端刷新可见）
    f_obj = ingest_path(db, target)
    db.commit()

    return {
        "id": f_obj.id if f_obj else None,
        "filename": target.name,
        "size": target.stat().st_size,
        "item_id": item_id,
        "saved_to": str(target.relative_to(settings.PROJECTS_DIR.parent)),
    }
