"""项目路由。"""
import shutil
from datetime import date
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.core.paths import safe_join
from app.database import get_db
from app.models import Project, Item
from app.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    ProjectProgress, ItemResponse, ItemListResponse, FileInItem
)
from app.services import project_service

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _to_response(p: Project, db: Session) -> ProjectResponse:
    progress = project_service.compute_progress(db, p)
    return ProjectResponse(
        id=p.id,
        name=p.name,
        handover_date=p.handover_date,
        deadline=p.deadline,
        construction_unit=p.construction_unit,
        handover_person=p.handover_person,
        receiving_unit=p.receiving_unit,
        receiving_person=p.receiving_person,
        status=p.status,
        created_at=p.created_at,
        progress=progress,
        days_to_deadline=project_service.days_to_deadline(p.deadline),
    )


@router.get("", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.deadline.asc()).all()
    return [_to_response(p, db) for p in projects]


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    p = project_service.create_project(db, payload.model_dump())
    return _to_response(p, db)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")
    return _to_response(p, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")
    if p.status == "archived":
        raise HTTPException(422, "归档项目不可编辑")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.post("/{project_id}/archive", response_model=ProjectResponse)
def archive_project(project_id: str, db: Session = Depends(get_db)):
    """手动归档项目。

    归档条件：项目下所有 item 状态均为 confirmed（已确认）。
    归档后项目只读，不可再编辑/添加/驳回/确认/重置 item，不可重新归档。
    """
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")
    if p.status == "archived":
        raise HTTPException(409, "项目已归档")
    # 检查 25 项是否全部 confirmed
    unconfirmed = (
        db.query(Item)
        .filter(Item.project_id == project_id, Item.status != "confirmed")
        .count()
    )
    if unconfirmed > 0:
        raise HTTPException(
            409,
            f"项目下还有 {unconfirmed} 项未确认，归档前必须全部确认。",
        )
    p.status = "archived"
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    """删除项目（硬删）。

    行为：
      1. 删除磁盘目录 projects/<id>/ 下的所有 25 个子文件夹 + 临时文件
      2. 删除数据库记录（items / files / settlement_logs 走 ORM cascade）

    注意：删除是**不可逆**的。前端在调用此接口前必须做二次确认。

    修 C3 (REVIEW-TRACK2 C3)：之前顺序是"先 DB 后磁盘"，
    导致 Windows 上 PDF 文件被句柄锁住时 rmtree 失败但 DB 已删，
    出现"204 成功 + 磁盘孤儿永久留尸"。改为先删磁盘，失败则返回 500，
    DB 记录保持可重试。
    """
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")

    # 1. 先删磁盘项目目录（失败 → 500，DB 记录保持，重试有效）
    project_dir = safe_join(settings.PROJECTS_DIR, project_id)
    if project_dir.exists() and project_dir.is_dir():
        try:
            shutil.rmtree(project_dir)
        except OSError as e:
            import logging
            logging.getLogger("app").error(
                "删除项目目录失败: %s → %s（DB 记录保持，可重试）", project_dir, e,
            )
            raise HTTPException(
                500,
                f"删除项目目录失败（文件可能正在被其他程序占用）：{e}",
            )

    # 2. 删 DB 记录（cascading 自动删 items / files / settlement_logs）
    db.delete(p)
    db.commit()
