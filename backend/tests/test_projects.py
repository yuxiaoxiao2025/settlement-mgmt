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
    """deadline 早于今天：必须 422（修 REVIEW-TRACK2 C2：之前函数名撒谎接受 2020 年的项目）。"""
    payload = _payload(deadline=(date.today() - timedelta(days=1)).isoformat())
    r = client.post("/api/projects", json=payload)
    assert r.status_code == 422, r.text
    # detail 里能找到"截止日期不可早于今天"
    body = r.json()
    detail_str = str(body)
    assert "不可早于今天" in detail_str or "today" in detail_str.lower()


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


def _confirm_all_items(client, project_id: str) -> None:
    """把项目下所有 item 设为 confirmed（走与 client 相同的 test engine，绕过 API）。"""
    from app.models import Item
    from app.database import engine
    from sqlalchemy.orm import sessionmaker

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with SessionLocal() as s:
        s.query(Item).filter(Item.project_id == project_id).update(
            {Item.status: "confirmed"}
        )
        s.commit()


def test_update_archived_project_returns_422(client, sample_project):
    """归档项目不可编辑 → 422。"""
    pid = sample_project["id"]
    _confirm_all_items(client, pid)
    # 归档
    r = client.post(f"/api/projects/{pid}/archive")
    assert r.status_code == 200, r.text
    # 改名字应被拒
    r = client.patch(f"/api/projects/{pid}", json={"name": "改不了"})
    assert r.status_code == 422


# ============ 归档 / 删除 ============

def test_archive_project(client, sample_project):
    """归档：所有 item 都 confirmed 后成功。"""
    pid = sample_project["id"]
    _confirm_all_items(client, pid)
    r = client.post(f"/api/projects/{pid}/archive")
    assert r.status_code == 200
    assert r.json()["status"] == "archived"


def test_archive_project_with_pending_items_returns_409(
    client, sample_project
):
    """归档：未全部 confirmed → 409。"""
    pid = sample_project["id"]
    r = client.post(f"/api/projects/{pid}/archive")
    assert r.status_code == 409
    # 重复归档已确认的项目也走 409
    _confirm_all_items(client, pid)
    r = client.post(f"/api/projects/{pid}/archive")
    assert r.status_code == 200
    r = client.post(f"/api/projects/{pid}/archive")
    assert r.status_code == 409


def test_archive_project_not_found(client):
    r = client.post("/api/projects/xxx/archive")
    assert r.status_code == 404


def test_delete_project(client, sample_project, settings):
    pid = sample_project["id"]
    # 项目目录在创建时就建了 25 个子文件夹
    project_dir = settings.PROJECTS_DIR / pid
    assert project_dir.exists()
    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 204
    # 列表应为空
    r = client.get("/api/projects")
    assert r.json() == []
    # 详情 404
    r = client.get(f"/api/projects/{pid}")
    assert r.status_code == 404
    # 磁盘目录应被清空
    assert not project_dir.exists(), f"项目目录应被删除: {project_dir}"


def test_delete_project_not_found(client):
    r = client.delete("/api/projects/xxx")
    assert r.status_code == 404


def test_delete_archived_project_succeeds(client, sample_project):
    """归档项目也能删除（用户明确要求）。"""
    pid = sample_project["id"]
    _confirm_all_items(client, pid)
    client.post(f"/api/projects/{pid}/archive")
    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 204


# ============ 模板选择（v0.2.0）============


def test_create_project_without_selected_seqs_creates_all_items(
    client, sample_project
):
    """旧行为：不传 selected_template_seqs → 建全量 25 项（向后兼容）。"""
    r = client.get(f"/api/projects/{sample_project['id']}")
    assert r.json()["progress"]["total"] == 25


def test_create_project_with_empty_selected_seqs_creates_no_items(client, settings):
    """空列表 → 一个都不建（用户明确选择创建空项目）。"""
    today = date.today()
    r = client.post(
        "/api/projects",
        json={
            "name": "空项目",
            "deadline": (today + timedelta(days=30)).isoformat(),
            "selected_template_seqs": [],
        },
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["progress"]["total"] == 0
    # 磁盘上项目目录应存在但**没有子文件夹**
    assert (settings.PROJECTS_DIR / pid).exists()
    children = [
        d for d in (settings.PROJECTS_DIR / pid).iterdir()
        if d.is_dir() and d.name != "_unclaimed"
    ]
    assert children == [], f"空项目不应建任何子文件夹，但有: {children}"


def test_create_project_with_selected_seqs_creates_only_those(
    client, settings
):
    """只勾选 [1, 5, 10] → 项目下只建 3 个 item + 3 个子文件夹。"""
    today = date.today()
    r = client.post(
        "/api/projects",
        json={
            "name": "小项目",
            "deadline": (today + timedelta(days=30)).isoformat(),
            "selected_template_seqs": [1, 5, 10],
        },
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    body = r.json()
    assert body["progress"]["total"] == 3
    # 磁盘上应有 3 个子文件夹
    children = sorted([
        d.name for d in (settings.PROJECTS_DIR / pid).iterdir()
        if d.is_dir() and d.name != "_unclaimed"
    ])
    assert len(children) == 3, f"应有 3 个子文件夹，实际: {children}"
    # 顺序应保持模板的 seq
    assert children[0].startswith("01_")
    assert children[1].startswith("05_")
    assert children[2].startswith("10_")


def test_create_project_with_invalid_seq_silently_ignored(
    client, settings
):
    """越界 seq（如 999）静默忽略，只建合法的。"""
    today = date.today()
    r = client.post(
        "/api/projects",
        json={
            "name": "含越界",
            "deadline": (today + timedelta(days=30)).isoformat(),
            "selected_template_seqs": [1, 999, 5],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["progress"]["total"] == 2


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
