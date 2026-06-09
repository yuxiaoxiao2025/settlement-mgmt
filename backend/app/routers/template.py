"""模版管理路由。"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import TemplateResponse, PromoteRequest, PromoteResponse
from app.services.item_service import promote_to_template
from app.services.project_service import get_or_load_template_items

router = APIRouter(prefix="/api/template", tags=["template"])


@router.get("", response_model=TemplateResponse)
def get_template():
    items = get_or_load_template_items()
    with open(settings.TEMPLATE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return TemplateResponse(version=data.get("version", 1), items=items)


@router.post("/items", response_model=PromoteResponse)
def promote_item(payload: PromoteRequest):
    result = promote_to_template(payload.name, payload.description)
    return PromoteResponse(**result)
