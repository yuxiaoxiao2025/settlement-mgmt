"""资料项状态机测试。"""
from __future__ import annotations
from datetime import date, timedelta
from pathlib import Path

from app.models import Item, File
from app.database import SessionLocal


def _create_project(client, name="测试"):
    today = date.today()
    return client.post("/api/projects", json={
        "name": name,
        "handover_date": today.isoformat(),
        "deadline": (today + timedelta(days=30)).isoformat(),
    }).json()


# ============ 列表 ============

def test_list_items_25_default(client):
    p = _create_project(client, "默认25项")
    r = client.get(f"/api/projects/{p['id']}/items")
    assert r.status_code == 200
    body = r.json()
    assert body["project_id"] == p["id"]
    assert len(body["items"]) == 25


def test_list_items_ordered_by_seq(client):
    p = _create_project(client)
    r = client.get(f"/api/projects/{p['id']}/items")
    items = r.json()["items"]
    seqs = [i["seq"] for i in items]
    assert seqs == sorted(seqs)
    assert seqs[0] == 1
    assert seqs[-1] == 25


def test_list_items_initial_status_pending(client):
    p = _create_project(client)
    r = client.get(f"/api/projects/{p['id']}/items")
    items = r.json()["items"]
    assert all(i["status"] == "pending" for i in items)


# ============ 状态机：uploaded 触发 ============

def _upload_one_file(client, project_id, subfolder: Path, make_pdf):
    """在子文件夹里放一个 PDF，调用 refresh，验证 status -> uploaded。"""
    pdf = subfolder / "测试文件.pdf"
    make_pdf(pdf)
    # 找该子文件夹对应的 item
    items = client.get(f"/api/projects/{project_id}/items").json()["items"]
    target = next(
        (i for i in items if (subfolder.name.split("_", 1)[1] in (i["name"] or "").replace(" ", ""))),
        None,
    )
    if target is None:
        # fallback: 按子文件夹名里的 seq
        seq = int(subfolder.name.split("_", 1)[0])
        target = next(i for i in items if i["seq"] == seq)
    r = client.post(f"/api/items/{target['id']}/refresh")
    assert r.status_code == 200
    return target["id"]


def test_upload_changes_status_to_uploaded(client, settings, make_pdf):
    p = _create_project(client, "上传触发")
    pid = p["id"]
    # 找第一个 item 的子文件夹
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    from app.core.template_loader import _sanitize_name
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    folder.mkdir(parents=True, exist_ok=True)
    pdf = folder / "测试文件.pdf"
    make_pdf(pdf)
    # 触发 refresh
    r = client.post(f"/api/items/{first['id']}/refresh")
    assert r.status_code == 200
    # 再列一次
    r2 = client.get(f"/api/projects/{pid}/items")
    updated = next(i for i in r2.json()["items"] if i["id"] == first["id"])
    assert updated["status"] == "uploaded"
    assert len(updated["files"]) >= 1


# ============ confirm / reject / reset ============

def test_confirm_uploaded_item_succeeds(client, settings, make_pdf):
    p = _create_project(client, "确认")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    from app.core.template_loader import _sanitize_name
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    folder.mkdir(parents=True, exist_ok=True)
    make_pdf(folder / "ok.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    r = client.post(f"/api/items/{first['id']}/confirm", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "confirmed"
    assert body["confirmed_at"] is not None


def test_confirm_pending_item_returns_409(client):
    """pending 状态不允许 confirm。"""
    p = _create_project(client, "pending→confirm")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    r = client.post(f"/api/items/{items[0]['id']}/confirm", json={})
    assert r.status_code == 409


def test_confirm_with_no_files_returns_409(client, settings, make_pdf):
    """uploaded 后 DB 记录清空 → confirm 应失败。"""
    p = _create_project(client, "无文件确认")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    from app.core.template_loader import _sanitize_name
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    folder.mkdir(parents=True, exist_ok=True)
    make_pdf(folder / "tmp.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    # 删 DB 里的 File 记录
    from app.models import File as FileModel
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        s.query(FileModel).filter(FileModel.item_id == first["id"]).delete()
        s.commit()
    finally:
        s.close()
    # 此时 item.files 应为空
    r = client.post(f"/api/items/{first['id']}/confirm", json={})
    assert r.status_code == 409, f"期望 409，实际 {r.status_code}: {r.text}"


def test_reject_uploaded_item_succeeds(client, settings, make_pdf):
    p = _create_project(client, "驳回")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    from app.core.template_loader import _sanitize_name
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    folder.mkdir(parents=True, exist_ok=True)
    make_pdf(folder / "x.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    r = client.post(f"/api/items/{first['id']}/reject", json={"note": "页数不对"})
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"
    assert r.json()["rejected_note"] == "页数不对"


def test_reject_pending_item_returns_409(client):
    p = _create_project(client, "pending→reject")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    r = client.post(f"/api/items/{items[0]['id']}/reject", json={"note": "x"})
    assert r.status_code == 409


def test_reject_missing_note_returns_422(client):
    """reject 必须有 note。"""
    p = _create_project(client, "reject无note")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    r = client.post(f"/api/items/{items[0]['id']}/reject", json={})
    assert r.status_code == 422


def test_reset_confirmed_item_to_pending(client, settings, make_pdf):
    p = _create_project(client, "重置")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    from app.core.template_loader import _sanitize_name
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    folder.mkdir(parents=True, exist_ok=True)
    make_pdf(folder / "x.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    client.post(f"/api/items/{first['id']}/confirm", json={})
    r = client.post(f"/api/items/{first['id']}/reset")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "pending"
    assert body["confirmed_at"] is None


def test_reset_pending_item_succeeds(client):
    """pending → pending（幂等）。"""
    p = _create_project(client, "重置pending")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    r = client.post(f"/api/items/{items[0]['id']}/reset")
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


def test_confirm_with_primary_file_id(client, settings, make_pdf):
    """指定主文件 → 该文件 is_primary=True，其他 False。"""
    p = _create_project(client, "指定主文件")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    from app.core.template_loader import _sanitize_name
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    folder.mkdir(parents=True, exist_ok=True)
    make_pdf(folder / "a.pdf")
    make_pdf(folder / "b.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    r = client.get(f"/api/items/{first['id']}/files")
    files = r.json()
    assert len(files) >= 2
    target = files[1]["id"]  # 选第二个做主
    r = client.post(f"/api/items/{first['id']}/confirm", json={"primary_file_id": target})
    assert r.status_code == 200
    body = r.json()
    primaries = [f for f in body["files"] if f["is_primary"]]
    assert len(primaries) == 1
    assert primaries[0]["id"] == target


# ============ add_item (扩展项) ============

def test_add_extension_item_returns_201(client, settings):
    p = _create_project(client, "扩展项")
    pid = p["id"]
    r = client.post(f"/api/projects/{pid}/items", json={
        "name": "新加的扩展项",
        "description": "测试用",
    })
    assert r.status_code == 201
    body = r.json()
    # 注：pydantic v2 在 strict 模式下会拒 promote_available 字段，但响应端不强校验
    assert body["is_extension"] is True
    assert body["status"] == "pending"
    # promote_available 仅作 hint，可能存在也可能不存在
    if "promote_available" in body:
        assert isinstance(body["promote_available"], bool)


def test_add_extension_item_creates_subfolder(client, settings):
    p = _create_project(client, "扩展项建子文件夹")
    pid = p["id"]
    r = client.post(f"/api/projects/{pid}/items", json={"name": "新加的"})
    assert r.status_code == 201
    body = r.json()
    seq = body["seq"]
    from app.core.template_loader import _sanitize_name
    expected = settings.PROJECTS_DIR / pid / f"{seq:02d}_{_sanitize_name('新加的')}"
    assert expected.exists(), f"扩展项子文件夹未创建：{expected}"


def test_add_extension_item_assigns_next_seq(client):
    p = _create_project(client, "扩展seq")
    pid = p["id"]
    r1 = client.post(f"/api/projects/{pid}/items", json={"name": "扩展1"})
    r2 = client.post(f"/api/projects/{pid}/items", json={"name": "扩展2"})
    assert r1.json()["seq"] < r2.json()["seq"]
    # 至少 25（默认）+ 2 = 27
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    assert len(items) >= 27


# ============ update / delete item ============

def test_update_item_name(client):
    p = _create_project(client, "改项名")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    r = client.patch(f"/api/items/{first['id']}", json={"name": "改名"})
    assert r.status_code == 200
    assert r.json()["name"] == "改名"


def test_update_item_not_found(client):
    r = client.patch("/api/items/xxx", json={"name": "y"})
    assert r.status_code == 404


def test_delete_item(client):
    p = _create_project(client, "删项")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    target = items[0]
    r = client.delete(f"/api/items/{target['id']}")
    assert r.status_code == 204
    # 列表少一个
    items2 = client.get(f"/api/projects/{pid}/items").json()["items"]
    assert len(items2) == len(items) - 1


def test_delete_item_not_found(client):
    r = client.delete("/api/items/xxx")
    assert r.status_code == 404


# ============ 404 / 不存在 ============

def test_confirm_nonexistent_item(client):
    r = client.post("/api/items/xxx/confirm", json={})
    assert r.status_code == 404


def test_reject_nonexistent_item(client):
    r = client.post("/api/items/xxx/reject", json={"note": "x"})
    assert r.status_code == 404


def test_reset_nonexistent_item(client):
    r = client.post("/api/items/xxx/reset")
    assert r.status_code == 404
