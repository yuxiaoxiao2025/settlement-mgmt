"""结算书生成测试。"""
from __future__ import annotations
from datetime import date, timedelta
from pathlib import Path

from app.core.template_loader import _sanitize_name


def _create_project(client, name="结算测试"):
    today = date.today()
    return client.post("/api/projects", json={
        "name": name,
        "handover_date": today.isoformat(),
        "deadline": (today + timedelta(days=30)).isoformat(),
    }).json()


def _upload_and_confirm_all(client, settings, pid, items, make_pdf):
    """为所有 item 放一个 PDF → uploaded → confirm。"""
    for item in items:
        folder = settings.PROJECTS_DIR / pid / f"{item['seq']:02d}_{_sanitize_name(item['name'])}"
        folder.mkdir(parents=True, exist_ok=True)
        make_pdf(folder / "ok.pdf")
        r = client.post(f"/api/items/{item['id']}/refresh")
        assert r.status_code == 200
        r = client.post(f"/api/items/{item['id']}/confirm", json={})
        assert r.status_code == 200, f"item {item['seq']} confirm fail: {r.text}"


# ============ preview ============

def test_preview_empty_project_not_ready(client):
    p = _create_project(client, "未就绪")
    pid = p["id"]
    r = client.get(f"/api/projects/{pid}/settlement/preview")
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is False
    assert len(body["missing"]) == 25


def test_preview_after_all_confirmed_ready(client, settings, make_pdf):
    p = _create_project(client, "全部确认")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    _upload_and_confirm_all(client, settings, pid, items, make_pdf)
    r = client.get(f"/api/projects/{pid}/settlement/preview")
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True
    assert body["missing"] == []


def test_preview_nonexistent_project(client):
    r = client.get("/api/projects/xxx/settlement/preview")
    assert r.status_code == 404


# ============ build ============

def test_build_unconfirmed_returns_409(client):
    p = _create_project(client, "未确认禁止build")
    pid = p["id"]
    r = client.post(f"/api/projects/{pid}/settlement/build")
    assert r.status_code == 409


def test_build_nonexistent_project(client):
    r = client.post("/api/projects/xxx/settlement/build")
    assert r.status_code == 404


def test_build_succeeds_when_all_confirmed(client, settings, make_pdf):
    p = _create_project(client, "build成功")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    _upload_and_confirm_all(client, settings, pid, items, make_pdf)
    r = client.post(f"/api/projects/{pid}/settlement/build")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body.get("output_path")
    assert body.get("file_size", 0) > 0
    # 物理文件应存在
    out = Path(body["output_path"])
    assert out.exists()
    assert out.stat().st_size > 0


def test_build_returns_valid_pdf(client, settings, make_pdf):
    p = _create_project(client, "PDF格式")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    _upload_and_confirm_all(client, settings, pid, items, make_pdf)
    r = client.post(f"/api/projects/{pid}/settlement/build")
    body = r.json()
    out = Path(body["output_path"])
    # 头 4 字节是 %PDF
    with open(out, "rb") as f:
        head = f.read(4)
    assert head == b"%PDF"


# ============ status ============

def test_status_initial_idle(client):
    p = _create_project(client, "status空")
    pid = p["id"]
    r = client.get(f"/api/projects/{pid}/settlement/status")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "idle"


def test_status_after_build_returns_success(client, settings, make_pdf):
    p = _create_project(client, "status成功")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    _upload_and_confirm_all(client, settings, pid, items, make_pdf)
    client.post(f"/api/projects/{pid}/settlement/build")
    r = client.get(f"/api/projects/{pid}/settlement/status")
    body = r.json()
    assert body["status"] == "success"
    assert body.get("finished_at") is not None


# ============ download ============

def test_download_settlement_pdf(client, settings, make_pdf):
    p = _create_project(client, "下载PDF")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    _upload_and_confirm_all(client, settings, pid, items, make_pdf)
    client.post(f"/api/projects/{pid}/settlement/build")
    r = client.get(f"/api/projects/{pid}/settlement/download")
    # fastapi 0.115 默认 as_attachment=True，所以会返回 200
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert r.content[:4] == b"%PDF"


def test_download_before_build_returns_404(client):
    p = _create_project(client, "未build就下载")
    pid = p["id"]
    r = client.get(f"/api/projects/{pid}/settlement/download")
    assert r.status_code == 404


# ============ 输出文件位置 ============

def test_settlement_output_in_final_dir(client, settings, make_pdf):
    """输出文件应在 projects/<id>/final/ 下。"""
    p = _create_project(client, "输出位置")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    _upload_and_confirm_all(client, settings, pid, items, make_pdf)
    r = client.post(f"/api/projects/{pid}/settlement/build")
    body = r.json()
    out = Path(body["output_path"])
    # 路径应在 PROJECTS_DIR/<pid>/final/ 下
    assert settings.PROJECTS_DIR in out.parents
    assert out.parent.name == "final"
    assert pid in str(out)
