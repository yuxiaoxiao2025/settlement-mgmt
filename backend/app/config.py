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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# 确保关键目录存在
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
