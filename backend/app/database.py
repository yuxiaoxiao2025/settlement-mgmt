"""SQLAlchemy 数据库。"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

engine = create_engine(
    f"sqlite:///{settings.DB_PATH}",
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI Depends。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """建表。"""
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
