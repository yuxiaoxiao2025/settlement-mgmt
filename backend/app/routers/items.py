"""资料项路由。"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, File
from app.schemas import (
    ItemCreate, ItemUpdate, ItemResponse, ItemListResponse, FileInItem,
    ConfirmRequest, RejectRequest
)
from app.services import item_service

router = APIRouter(tags=["items"])


def _to_response(item: Item) -> ItemResponse:
    return ItemResponse(
        id=item.id,
        seq=item.seq,
        name=item.name,
        description=item.description,
        pages=item.pages,
        status=item.status,
        rejected_note=item.rejected_note,
        confirmed_at=item.confirmed_at,
        is_extension=item.is_extension,
        files=[
            FileInItem(
                id=f.id,
                filename=f.filename,
                filesize=f.filesize,
                is_pdf=f.is_pdf,
                is_primary=f.is_primary,
                uploaded_at=f.uploaded_at,
            )
            for f in item.files
        ],
    )


@router.get("/api/projects/{project_id}/items", response_model=ItemListResponse)
def list_items(project_id: str, db: Session = Depends(get_db)):
    items = db.query(Item).filter(Item.project_id == project_id).order_by(Item.seq).all()
    unclaimed = db.query(File).filter(File.item_id == "").all()
    # 只取当前项目未认领的
    unclaimed_in_project = [
        u for u in unclaimed
        if u.original_path and f"/projects/{project_id}/" in u.original_path.replace("\\", "/")
    ]
    return ItemListResponse(
        project_id=project_id,
        items=[_to_response(i) for i in items],
        unclaimed=[
            FileInItem(
                id=u.id, filename=u.filename, filesize=u.filesize,
                is_pdf=u.is_pdf, is_primary=u.is_primary, uploaded_at=u.uploaded_at,
            )
            for u in unclaimed_in_project
        ],
    )


@router.post("/api/projects/{project_id}/items", response_model=ItemResponse, status_code=201)
def add_item(project_id: str, payload: ItemCreate, db: Session = Depends(get_db)):
    item, promote_available = item_service.add_item(
        db, project_id, payload.name, payload.description,
    )
    resp = _to_response(item).model_dump()
    resp["promote_available"] = promote_available
    return resp


@router.patch("/api/items/{item_id}", response_model=ItemResponse)
def update_item(item_id: str, payload: ItemUpdate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "item 不存在")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "item 不存在")
    db.delete(item)
    db.commit()


@router.post("/api/items/{item_id}/confirm", response_model=ItemResponse)
def confirm_item(item_id: str, payload: ConfirmRequest = ConfirmRequest(), db: Session = Depends(get_db)):
    try:
        item = item_service.confirm_item(db, item_id, payload.primary_file_id)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))
    return _to_response(item)


@router.post("/api/items/{item_id}/reject", response_model=ItemResponse)
def reject_item(item_id: str, payload: RejectRequest, db: Session = Depends(get_db)):
    try:
        item = item_service.reject_item(db, item_id, payload.note)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))
    return _to_response(item)


@router.post("/api/items/{item_id}/reset", response_model=ItemResponse)
def reset_item(item_id: str, db: Session = Depends(get_db)):
    try:
        item = item_service.reset_item(db, item_id)
    except LookupError as e:
        raise HTTPException(404, str(e))
    return _to_response(item)
