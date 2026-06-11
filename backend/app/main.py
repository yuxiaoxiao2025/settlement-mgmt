"""FastAPI 主入口。"""
import socket
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import init_db, SessionLocal
from app.services.watcher_service import WatcherService
from app.services.file_service import ingest_path, remove_path
from app.routers import projects, items, files, template, settlement
from app.models import AccessLog
from pathlib import Path


# 全局 watcher 引用
_watcher: WatcherService | None = None


def _on_watcher_event(event_type: str, kind: str, path: Path):
    """watchdog 回调。"""
    try:
        with SessionLocal() as db:
            if event_type in ("created", "modified"):
                ingest_path(db, path)
            elif event_type == "deleted":
                remove_path(db, path)
    except Exception as e:
        print(f"[WATCHER] 处理失败: {path} → {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动 + 关闭钩子。"""
    global _watcher
    # 1. 初始化 DB
    init_db()
    print("[OK] 数据库初始化完成")

    # 2. 启动 watcher
    _watcher = WatcherService(_on_watcher_event)
    _watcher.start()
    if _watcher.is_available:
        print(f"[OK] 文件监听启动：{settings.PROJECTS_DIR}")
    else:
        print("[WARN] 文件监听不可用，已回退到手动刷新")

    # 3. 探测 WPS（启动时一次，结果缓存到 wps_detector）
    from app.core.wps_detector import init_wps_detector
    wps = init_wps_detector(settings.WPS_PATH)
    if wps:
        print(f"[OK] WPS CLI: {wps}")
    else:
        print("[WARN] 未找到 WPS CLI，PDF 转码功能不可用（非 PDF 文件仍可入库，仅无预览）")

    # 4. 打印所有网卡 IP（方便局域网访问）
    print("\n" + "=" * 60)
    print(f"服务已启动  http://{settings.HOST}:{settings.PORT}")
    print("局域网访问地址（任选其一）：")
    for ip in _list_local_ips():
        print(f"  http://{ip}:{settings.PORT}")
    print("=" * 60 + "\n")

    yield

    # 关闭
    if _watcher:
        _watcher.stop()
    print("[BYE] 服务关闭")


def _list_local_ips() -> list[str]:
    ips = ["127.0.0.1"]
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ip not in ips and ":" not in ip:
                ips.append(ip)
    except Exception:
        pass
    return ips


app = FastAPI(
    title="项目结算资料管理系统",
    description="局域网工具：模版 + 项目 + 文件监听 + PDF 合并",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # 不再加 "*"，spec 合规
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 访问日志中间件
@app.middleware("http")
async def access_log_middleware(request: Request, call_next):
    response = await call_next(request)
    if settings.ACCESS_LOG:
        try:
            with SessionLocal() as db:
                db.add(AccessLog(
                    ip=request.client.host if request.client else "",
                    user_agent=request.headers.get("user-agent", "")[:200],
                    method=request.method,
                    path=request.url.path,
                    status_code=response.status_code,
                ))
                db.commit()
        except Exception:
            pass
    return response


# 全局错误处理（H4: 日志化，避免泄漏原始异常）
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logger = logging.getLogger("app")
    logger.exception(
        "unhandled exception path=%s method=%s",
        request.url.path,
        request.method,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误", "code": "internal_error"},
    )


# 健康检查
@app.get("/api/health")
def health():
    from app.core.wps_detector import get_wps_path
    return {
        "status": "ok",
        "watcher": _watcher.is_available if _watcher else False,
        "watcher_mode": _watcher.mode if _watcher else "stopped",
        "wps": get_wps_path() is not None,
    }


# 挂载路由
app.include_router(projects.router)
app.include_router(items.router)
app.include_router(files.router)
app.include_router(template.router)
app.include_router(settlement.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )
