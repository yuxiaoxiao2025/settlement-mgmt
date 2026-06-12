"""Pytest conftest - fixtures for backend tests."""
from __future__ import annotations

import os
from datetime import date, timedelta
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import Session

os.environ.setdefault("ACCESS_LOG", "false")
# 修 B-01：4 个 auth secret 在 conftest 顶层注入默认 dev 值
# CI / 本地可覆盖；部署时 .env 仍然优先（pydantic-settings 会用 .env 覆盖）
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")
os.environ.setdefault("SITE_VERIFICATION_CODE", "jrvUPovFZS8")
os.environ.setdefault("JWT_SECRET", "test_secret_32bytes_xxxxxxxxxxxxx_padding")

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_REAL_TEMPLATE = _PROJECT_ROOT / "data" / "master_template.json"
# CI / 干净 clone：data/ 在 .gitignore，优先用 tests/fixtures 的精简版
_FIXTURE_TEMPLATE = Path(__file__).resolve().parent / "fixtures" / "master_template.json"
if _FIXTURE_TEMPLATE.exists():
    os.environ.setdefault("TEMPLATE_PATH", str(_FIXTURE_TEMPLATE))
else:
    os.environ.setdefault("TEMPLATE_PATH", str(_REAL_TEMPLATE))


@pytest.fixture
def tmp_projects_dir(tmp_path):
	d = tmp_path / "projects"
	d.mkdir(parents=True, exist_ok=True)
	return d


@pytest.fixture
def test_engine(tmp_path):
	db_file = tmp_path / "test.db"
	engine = create_engine(
		f"sqlite:///{db_file}",
		connect_args={"check_same_thread": False},
		pool_pre_ping=True,
	)
	try:
		yield engine
	finally:
		engine.dispose()
		if db_file.exists():
			try:
				db_file.unlink()
			except OSError:
				pass


@pytest.fixture
def settings(tmp_projects_dir, test_engine, monkeypatch):
	from app import config, database
	from app.database import Base

	monkeypatch.setattr(config.settings, "PROJECTS_DIR", tmp_projects_dir, raising=True)
	monkeypatch.setattr(config.settings, "ACCESS_LOG", False, raising=True)

	monkeypatch.setattr(database, "engine", test_engine, raising=True)
	NewSessionLocal = sessionmaker(
		autocommit=False, autoflush=False, bind=test_engine
	)
	monkeypatch.setattr(database, "SessionLocal", NewSessionLocal, raising=True)

	Base.metadata.drop_all(bind=test_engine)
	Base.metadata.create_all(bind=test_engine)

	yield config.settings


@pytest.fixture
def db(settings, test_engine):
	SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
	session = SessionLocal()
	try:
		yield session
	finally:
		session.close()


@pytest.fixture
def client(settings, test_engine):
	from app.database import get_db
	from app.main import app
	from app.config import settings as _s

	TestSessionLocal = sessionmaker(
		autocommit=False, autoflush=False, bind=test_engine
	)

	def override_get_db():
		d = TestSessionLocal()
		try:
			yield d
		finally:
			d.close()

	app.dependency_overrides[get_db] = override_get_db
	try:
		# 修 B-01：每个测试重置 slowapi limiter（避免上一个测试的登录计数影响下一个）
		from app.routers.auth import limiter as _auth_limiter
		_auth_limiter.reset()
		with TestClient(app) as c:
			# 修 B-01：业务 API 需鉴权（v0.3.1+），client fixture 启动时自动登录
			# 把 token 注入 c.headers['Authorization']，业务测试无需各自处理
			r = c.post("/api/auth/login", json={
				"username": _s.ADMIN_USERNAME,
				"password": _s.ADMIN_PASSWORD,
				"verification_code": _s.SITE_VERIFICATION_CODE,
			})
			assert r.status_code == 200, f"login failed in fixture: {r.text}"
			token = r.json()["access_token"]
			c.headers["Authorization"] = f"Bearer {token}"
			yield c
	finally:
		app.dependency_overrides.pop(get_db, None)


def _valid_payload(**overrides):
	today = date.today()
	base = {
		"name": "测试项目A",
		"handover_date": today.isoformat(),
		"deadline": (today + timedelta(days=30)).isoformat(),
		"construction_unit": "建管一",
		"handover_person": "张三",
		"receiving_unit": "接收一",
		"receiving_person": "李四",
	}
	base.update(overrides)
	return base


@pytest.fixture
def sample_project(client):
	r = client.post("/api/projects", json=_valid_payload())
	assert r.status_code ==201, r.text
	return r.json()


@pytest.fixture
def sample_items(client, sample_project):
	r = client.get(f"/api/projects/{sample_project["id"]}/items")
	assert r.status_code ==200, r.text
	return r.json()["items"]


@pytest.fixture
def sample_item(sample_items):
	assert len(sample_items) >=1
	return sample_items[0]


@pytest.fixture
def sample_subfolder(settings, sample_project, sample_item):
	from app.core.template_loader import _sanitize_name

	folder = (
		settings.PROJECTS_DIR
		/ sample_project["id"]
		/ f"{sample_item["seq"]:02d}_{_sanitize_name(sample_item["name"])}"
	)
	assert folder.exists(), f"子文件夹应已自动创建: {folder}"
	return folder


def make_minimal_pdf(path, num_pages=1):
	from reportlab.lib.pagesizes import A4
	from reportlab.pdfgen import canvas

	path.parent.mkdir(parents=True, exist_ok=True)
	c = canvas.Canvas(str(path), pagesize=A4)
	for i in range(num_pages):
		c.drawString(100,100, f"page {i +1}")
		c.showPage()
	c.save()
	return path


def write_text(path, content="hello"):
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text(content, encoding="utf-8")
	return path


@pytest.fixture
def make_pdf():
	return make_minimal_pdf


@pytest.fixture
def write_file():
	return write_text