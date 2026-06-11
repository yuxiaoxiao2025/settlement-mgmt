"""配置管理。"""
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置。

    可通过 .env 文件或环境变量覆盖。
    """

    # 服务
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LAN_MODE: bool = True

    # 路径（相对 backend/）
    # ⚠️ pydantic-settings 会把 Path 默认值当 relative string 解析（坑！）
    # 所以在 Settings() 实例化后强制覆盖一次（见 settings 构造处）
    DATA_DIR: Path = Path("../data")
    PROJECTS_DIR: Path = Path("../projects")
    DB_PATH: Path = Path("../data/settlement.db")
    TEMPLATE_PATH: Path = Path("../data/master_template.json")
    SOURCE_DOCX: Path = Path("../项目结算资料交接清单.docx")

    # 文件监听
    DEBOUNCE_SECONDS: float = 2.0
    WATCHDOG_FALLBACK_POLL: int = 5

    # 行为
    ACCESS_LOG: bool = True
    AUTO_PROMOTE_NEW_ITEMS: bool = False  # 是否自动推广新项到全局模版
    WPS_PATH: Optional[str] = None  # WPS CLI 路径（None 表示自动探测）

    # CORS（开发模式允许 5173 端口）
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # ── Auth (v0.3.1+ 公网部署 — see .env) ──
    # 详见 app/routers/auth.py：三件套登录 + JWT (aud/iss 校验) + HttpOnly cookie
    ADMIN_USERNAME: str = ""
    ADMIN_PASSWORD: str = ""
    SITE_VERIFICATION_CODE: str = ""
    JWT_SECRET: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# ── 修复 pydantic-settings 的 Path 解析坑 ────────────────────────
# class-level Path default 在 pydantic 内部会被当 relative str 解析，
# 结果脱离 backend/ 跑到奇怪的 cwd。
# 这里强制覆盖成基于 __file__ 的绝对路径，与 cwd 无关。
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_ROOT.parent
settings.DATA_DIR = _PROJECT_ROOT / "data"
settings.PROJECTS_DIR = _PROJECT_ROOT / "projects"
settings.DB_PATH = settings.DATA_DIR / "settlement.db"
settings.TEMPLATE_PATH = settings.DATA_DIR / "master_template.json"
settings.SOURCE_DOCX = _PROJECT_ROOT / "项目结算资料交接清单.docx"

# 确保关键目录存在
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
