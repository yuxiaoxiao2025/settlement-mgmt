"""结算书路由。"""
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import Project, Item, SettlementLog
from app.schemas import SettlementPreview, SettlementJobResponse
from app.services import settlement_builder

router = APIRouter(prefix="/api/projects/{project_id}/settlement", tags=["settlement"])


def _check_readiness(db: Session, project_id: str) -> SettlementPreview:
    items = db.query(Item).filter(Item.project_id == project_id).all()
    missing = [i.name for i in items if i.status != "confirmed"]
    return SettlementPreview(ready=not missing, missing=missing)


@router.get("/preview", response_model=SettlementPreview)
def preview(project_id: str, db: Session = Depends(get_db)):
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "项目不存在")
    return _check_readiness(db, project_id)


@router.get("/status")
def status(project_id: str, db: Session = Depends(get_db)):
    log = (
        db.query(SettlementLog)
        .filter(SettlementLog.project_id == project_id)
        .order_by(SettlementLog.started_at.desc())
        .first()
    )
    if not log:
        return {"status": "idle"}
    return SettlementJobResponse(
        job_id=log.id,
        status=log.status,
        started_at=log.started_at,
        finished_at=log.finished_at,
        output_path=log.output_path,
        file_size=log.file_size,
        error=log.error,
    )


@router.post("/build")
def build(
    project_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "项目不存在")
    preview_info = _check_readiness(db, project_id)
    if not preview_info.ready:
        raise HTTPException(409, f"未全部确认：{', '.join(preview_info.missing[:3])}...")
    client_ip = request.client.host if request.client else ""
    # 同步生成（首次实现走同步，便于测试）；后续可改为 BackgroundTasks
    try:
        log = settlement_builder.build_settlement(db, project_id, client_ip)
    except Exception as e:
        raise HTTPException(500, f"生成失败: {e}")

    # 注：归档是**手动**动作，由用户在项目详情页点「归档项目」按钮触发。
    # 见 POST /api/projects/{id}/archive。

    return SettlementJobResponse(
        job_id=log.id,
        status=log.status,
        started_at=log.started_at,
        finished_at=log.finished_at,
        output_path=log.output_path,
        file_size=log.file_size,
        error=log.error,
    )


def _find_latest_pdf(db: Session, project_id: str) -> Path:
    """从 settlement_logs 取最新一个 success 的 PDF 路径。"""
    log = (
        db.query(SettlementLog)
        .filter(SettlementLog.project_id == project_id, SettlementLog.status == "success")
        .order_by(SettlementLog.finished_at.desc())
        .first()
    )
    if not log or not log.output_path:
        raise HTTPException(404, "尚未生成结算书")
    p = Path(log.output_path)
    if not p.exists():
        raise HTTPException(404, "文件不存在")
    return p


@router.get("/download")
def download(project_id: str, db: Session = Depends(get_db)):
    """下载结算书 PDF（attachment 头，浏览器触发下载）"""
    p = _find_latest_pdf(db, project_id)
    return FileResponse(str(p), filename=p.name, content_disposition_type="attachment")


@router.get("/preview-pdf")
def preview_pdf(project_id: str, db: Session = Depends(get_db)):
    """预览结算书 PDF（inline 头，浏览器内嵌显示）"""
    p = _find_latest_pdf(db, project_id)
    return FileResponse(
        str(p),
        filename=p.name,
        content_disposition_type="inline",
        media_type="application/pdf",
    )
