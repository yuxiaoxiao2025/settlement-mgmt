"""项目路由。"""
from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project
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
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")
    p.status = "archived"
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "项目不存在")
    db.delete(p)
    db.commit()
