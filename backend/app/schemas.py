"""Pydantic schemas。"""
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


# ============= Project =============

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    handover_date: Optional[date] = None
    deadline: date
    construction_unit: Optional[str] = None
    handover_person: Optional[str] = None
    receiving_unit: Optional[str] = None
    receiving_person: Optional[str] = None

    @field_validator("deadline")
    @classmethod
    def deadline_must_be_future(cls, v: date, info):
        if "handover_date" in info.data and info.data["handover_date"] and v < info.data["handover_date"]:
            raise ValueError("截止日期不可早于移交日期")
        return v


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    handover_date: Optional[date] = None
    deadline: Optional[date] = None
    construction_unit: Optional[str] = None
    handover_person: Optional[str] = None
    receiving_unit: Optional[str] = None
    receiving_person: Optional[str] = None


class ProjectProgress(BaseModel):
    total: int
    confirmed: int
    uploaded: int
    rejected: int
    pending: int


class ProjectResponse(BaseModel):
    id: str
    name: str
    handover_date: Optional[date]
    deadline: date
    construction_unit: Optional[str]
    handover_person: Optional[str]
    receiving_unit: Optional[str]
    receiving_person: Optional[str]
    status: str
    created_at: datetime
    progress: ProjectProgress
    days_to_deadline: int

    class Config:
        from_attributes = True


# ============= Item =============

class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    pages: Optional[int] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pages: Optional[int] = None


class FileInItem(BaseModel):
    id: str
    filename: str
    filesize: int
    is_pdf: bool
    is_primary: bool
    uploaded_at: datetime

    class Config:
        from_attributes = True


class ItemResponse(BaseModel):
    id: str
    seq: int
    name: str
    description: Optional[str]
    pages: Optional[int]
    status: str
    rejected_note: Optional[str]
    confirmed_at: Optional[datetime]
    is_extension: bool
    files: List[FileInItem] = []

    class Config:
        from_attributes = True


class ItemListResponse(BaseModel):
    project_id: str
    items: List[ItemResponse]
    unclaimed: List[FileInItem]


# ============= Actions =============

class ConfirmRequest(BaseModel):
    primary_file_id: Optional[str] = None


class RejectRequest(BaseModel):
    note: str = Field(..., min_length=1)


# ============= Template =============

class TemplateItem(BaseModel):
    seq: int
    name: str
    description: Optional[str] = None
    is_default: bool = True


class TemplateResponse(BaseModel):
    version: int
    items: List[TemplateItem]


class PromoteRequest(BaseModel):
    name: str
    description: Optional[str] = None


class PromoteResponse(BaseModel):
    added: bool
    new_version: int
    total_items: int


# ============= Settlement =============

class SettlementPreview(BaseModel):
    ready: bool
    missing: List[str] = []  # 未 confirmed 的 item name 列表


class SettlementJobResponse(BaseModel):
    job_id: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    output_path: Optional[str] = None
    file_size: Optional[int] = None
    error: Optional[str] = None
