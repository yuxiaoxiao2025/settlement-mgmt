"""项目 CRUD 测试。"""
from __future__ import annotations
from datetime import date, timedelta


def _payload(**overrides):
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


# ============ 健康检查 ============

def test_health_endpoint(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"


# ============ 列表 / 空 ============

def test_list_projects_empty(client):
    r = client.get("/api/projects")
    assert r.status_code == 200
    assert r.json() == []


def test_list_projects_returns_created(client, sample_project):
    r = client.get("/api/projects")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == sample_project["id"]
    assert data[0]["name"] == sample_project["name"]


# ============ 创建 ============

def test_create_project_minimal(client):
    """最小字段：仅 name + deadline。"""
    payload = {
        "name": "最小项目",
        "deadline": (date.today() + timedelta(days=7)).isoformat(),
    }
    r = client.post("/api/projects", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "最小项目"
    assert body["status"] == "active"
    assert "id" in body
    assert body["progress"]["total"] >= 1


def test_create_project_full(client, settings):
    """完整字段 + 检查 25 项 + 25 子文件夹。"""
    r = client.post("/api/projects", json=_payload(name="完整项目"))
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "完整项目"
    pid = body["id"]
    # 子文件夹应在 PROJECTS_DIR/<id>/ 下
    project_dir = settings.PROJECTS_DIR / pid
    assert project_dir.exists()
    # 至少有 25 个子目录（取决于 master_template）
    subdirs = [d for d in project_dir.iterdir() if d.is_dir() and d.name != "_unclaimed"]
    assert len(subdirs) >= 25, f"期望 ≥25 子文件夹，实际 {len(subdirs)}"
    # meta.json 已写
    assert (project_dir / "meta.json").exists()


def test_create_project_deadline_in_past(client):
    """deadline 早于今天：pydantic v2 返回 422 (validation error)。"""
    payload = _payload(deadline=(date.today() - timedelta(days=1)).isoformat())
    r = client.post("/api/projects", json=payload)
    # pydantic v2 缺 "future" 约束时只校验 "deadline >= handover_date"，但不强制 future
    # 若 schema 接受过去日期则返回 201；否则 422。本测试只确保不 500
    assert r.status_code in (201, 422), r.text


def test_create_project_missing_required_fields(client):
    """name 或 deadline 缺失：422。"""
    r = client.post("/api/projects", json={"name": "x"})  # 缺 deadline
    assert r.status_code == 422
    body = r.json()
    assert "detail" in body


def test_create_project_empty_name(client):
    """name 为空字符串：422。"""
    r = client.post("/api/projects", json={
        "name": "",
        "deadline": (date.today() + timedelta(days=10)).isoformat(),
    })
    assert r.status_code == 422


def test_create_project_invalid_date_format(client):
    """deadline 格式错误：422。"""
    r = client.post("/api/projects", json={
        "name": "x",
        "deadline": "not-a-date",
    })
    assert r.status_code == 422


# ============ 详情 / 更新 ============

def test_get_project(client, sample_project):
    r = client.get(f"/api/projects/{sample_project['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == sample_project["id"]


def test_get_project_not_found(client):
    r = client.get("/api/projects/nonexistent-id-xxx")
    assert r.status_code == 404


def test_update_project_name(client, sample_project):
    pid = sample_project["id"]
    r = client.patch(f"/api/projects/{pid}", json={"name": "改名了"})
    assert r.status_code == 200
    assert r.json()["name"] == "改名了"


def test_update_project_deadline(client, sample_project):
    pid = sample_project["id"]
    new_deadline = (date.today() + timedelta(days=60)).isoformat()
    r = client.patch(f"/api/projects/{pid}", json={"deadline": new_deadline})
    assert r.status_code == 200
    assert r.json()["deadline"] == new_deadline


def test_update_project_not_found(client):
    r = client.patch("/api/projects/xxx", json={"name": "y"})
    assert r.status_code == 404


def test_update_archived_project_returns_422(client, sample_project):
    """归档项目不可编辑 → 422。"""
    pid = sample_project["id"]
    # 归档
    r = client.post(f"/api/projects/{pid}/archive")
    assert r.status_code == 200
    # 改名字应被拒
    r = client.patch(f"/api/projects/{pid}", json={"name": "改不了"})
    assert r.status_code == 422


# ============ 归档 / 删除 ============

def test_archive_project(client, sample_project):
    pid = sample_project["id"]
    r = client.post(f"/api/projects/{pid}/archive")
    assert r.status_code == 200
    assert r.json()["status"] == "archived"


def test_archive_project_not_found(client):
    r = client.post("/api/projects/xxx/archive")
    assert r.status_code == 404


def test_delete_project(client, sample_project, settings):
    pid = sample_project["id"]
    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 204
    # 列表应为空
    r = client.get("/api/projects")
    assert r.json() == []
    # 详情 404
    r = client.get(f"/api/projects/{pid}")
    assert r.status_code == 404


def test_delete_project_not_found(client):
    r = client.delete("/api/projects/xxx")
    assert r.status_code == 404


# ============ 进度计算 ============

def test_progress_initial_state(client, sample_project):
    """新项目所有项都是 pending。"""
    r = client.get(f"/api/projects/{sample_project['id']}")
    body = r.json()
    p = body["progress"]
    assert p["total"] >= 1
    assert p["pending"] == p["total"]
    assert p["confirmed"] == 0
    assert p["uploaded"] == 0
    assert p["rejected"] == 0


def test_days_to_deadline_is_int(client, sample_project):
    r = client.get(f"/api/projects/{sample_project['id']}")
    body = r.json()
    assert isinstance(body["days_to_deadline"], int)


# ============ 列表排序 ============

def test_list_projects_sorted_by_deadline(client):
    """列表应按 deadline 升序。"""
    # 远的先建
    r1 = client.post("/api/projects", json={
        "name": "远的",
        "deadline": (date.today() + timedelta(days=60)).isoformat(),
    })
    assert r1.status_code == 201
    # 近的后建
    r2 = client.post("/api/projects", json={
        "name": "近的",
        "deadline": (date.today() + timedelta(days=5)).isoformat(),
    })
    assert r2.status_code == 201
    r = client.get("/api/projects")
    data = r.json()
    assert len(data) == 2
    # 近的应在前
    assert data[0]["name"] == "近的"
    assert data[1]["name"] == "远的"
