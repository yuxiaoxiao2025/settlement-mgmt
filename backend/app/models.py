"""ORM 模型。"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Date, ForeignKey, Text
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id() -> str:
    return str(uuid.uuid4())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    handover_date = Column(Date, nullable=True)
    deadline = Column(Date, nullable=False)
    construction_unit = Column(String, nullable=True)
    handover_person = Column(String, nullable=True)
    receiving_unit = Column(String, nullable=True)
    receiving_person = Column(String, nullable=True)
    status = Column(String, default="active", nullable=False)  # active / archived
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("Item", back_populates="project", cascade="all, delete-orphan")
    settlements = relationship("SettlementLog", back_populates="project", cascade="all, delete-orphan")


class Item(Base):
    __tablename__ = "items"

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    seq = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    pages = Column(Integer, nullable=True)
    status = Column(String, default="pending", nullable=False)
    # pending / uploaded / confirmed / rejected
    rejected_note = Column(Text, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    is_extension = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="items")
    files = relationship("File", back_populates="item", cascade="all, delete-orphan")


class File(Base):
    __tablename__ = "files"

    id = Column(String, primary_key=True, default=gen_id)
    item_id = Column(String, ForeignKey("items.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_path = Column(String, nullable=False)
    pdf_path = Column(String, nullable=True)
    filesize = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    is_pdf = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)
    # 未匹配的归属（item_id 为 NULL）
    item_id_orphan = Column(String, nullable=True)

    item = relationship("Item", back_populates="files")


class SettlementLog(Base):
    __tablename__ = "settlement_logs"

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    status = Column(String, nullable=False)  # running / success / failed
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    output_path = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    requester_ip = Column(String, nullable=True)

    project = relationship("Project", back_populates="settlements")


class AccessLog(Base):
    __tablename__ = "access_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    method = Column(String, nullable=True)
    path = Column(String, nullable=True)
    status_code = Column(Integer, nullable=True)
