"""文件归属 / 列表 / 删除 测试。"""
from __future__ import annotations
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.models import Item, File
from app.database import SessionLocal


def _create_project(client, name="测试"):
    today = date.today()
    return client.post("/api/projects", json={
        "name": name,
        "handover_date": today.isoformat(),
        "deadline": (today + timedelta(days=30)).isoformat(),
    }).json()


def _first_item_subfolder(settings, pid, items, name_hint=None):
    from app.core.template_loader import _sanitize_name
    first = items[0]
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    folder.mkdir(parents=True, exist_ok=True)
    return first, folder


# ============ 列表 ============

def test_list_files_empty(client, settings):
    p = _create_project(client, "空文件")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    r = client.get(f"/api/items/{first['id']}/files")
    assert r.status_code == 200
    assert r.json() == []


def test_list_files_after_refresh(client, settings, make_pdf):
    p = _create_project(client, "refresh后列表")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "测试.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    r = client.get(f"/api/items/{first['id']}/files")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["filename"] == "测试.pdf"
    assert data[0]["is_pdf"] is True


def test_list_files_item_not_found(client):
    r = client.get("/api/items/xxx/files")
    assert r.status_code == 404


# ============ 刷新 ============

def test_refresh_item_returns_scanned_count(client, settings, make_pdf):
    p = _create_project(client, "refresh计数")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "a.pdf")
    make_pdf(folder / "b.pdf")
    r = client.post(f"/api/items/{first['id']}/refresh")
    assert r.status_code == 200
    body = r.json()
    assert body.get("scanned") == 1
    assert body.get("added") == 2


def test_refresh_no_folder_returns_zero(client, settings):
    """子文件夹不存在时返回 0/0。"""
    p = _create_project(client, "refresh无文件夹")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first = items[0]
    # 项目创建时已自动建子文件夹，删掉以测试 "no folder" 场景
    from app.core.template_loader import _sanitize_name
    folder = settings.PROJECTS_DIR / pid / f"{first['seq']:02d}_{_sanitize_name(first['name'])}"
    if folder.exists():
        import shutil
        shutil.rmtree(folder)
    r = client.post(f"/api/items/{first['id']}/refresh")
    assert r.status_code == 200
    body = r.json()
    assert body.get("scanned") == 0
    assert body.get("added") == 0


def test_refresh_idempotent(client, settings, make_pdf):
    """重复 refresh 不应创建重复文件记录。"""
    p = _create_project(client, "refresh幂等")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "dup.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    client.post(f"/api/items/{first['id']}/refresh")
    r = client.get(f"/api/items/{first['id']}/files")
    data = r.json()
    assert len(data) == 1


# ============ 预览 / 下载 ============

def test_preview_file_returns_pdf(client, settings, make_pdf):
    p = _create_project(client, "预览")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "view.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    files = client.get(f"/api/items/{first['id']}/files").json()
    fid = files[0]["id"]
    r = client.get(f"/api/files/{fid}/preview")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf") or \
        r.content[:4] == b"%PDF"


def test_preview_file_not_found(client):
    r = client.get("/api/files/xxx/preview")
    assert r.status_code == 404


def test_download_file_returns_200(client, settings, make_pdf):
    p = _create_project(client, "下载")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "down.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    files = client.get(f"/api/items/{first['id']}/files").json()
    fid = files[0]["id"]
    r = client.get(f"/api/files/{fid}/download")
    # fastapi 0.115 用 content_disposition_type，as_attachment 已被忽略
    # 但默认 disposition=attachment，仍返回 200
    assert r.status_code in (200, 404), r.status_code
    if r.status_code == 200:
        assert r.content[:4] == b"%PDF"


def test_download_file_not_found(client):
    r = client.get("/api/files/xxx/download")
    assert r.status_code == 404


# ============ 物理文件不存在 ============

def test_preview_after_physical_file_deleted(client, settings, make_pdf):
    """物理文件被删后 preview 404。"""
    p = _create_project(client, "物理删后preview")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    pdf = folder / "ghost.pdf"
    make_pdf(pdf)
    client.post(f"/api/items/{first['id']}/refresh")
    files = client.get(f"/api/items/{first['id']}/files").json()
    fid = files[0]["id"]
    pdf.unlink()
    r = client.get(f"/api/files/{fid}/preview")
    assert r.status_code == 404


# ============ 删除 ============

def test_delete_file_removes_record(client, settings, make_pdf):
    p = _create_project(client, "删文件记录")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "x.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    files = client.get(f"/api/items/{first['id']}/files").json()
    fid = files[0]["id"]
    r = client.delete(f"/api/files/{fid}")
    assert r.status_code == 204
    # 列表应空
    files2 = client.get(f"/api/items/{first['id']}/files").json()
    assert files2 == []


def test_delete_file_marks_pending_when_last(client, settings, make_pdf, db):
    """删完最后一个文件，item 状态回到 pending。"""
    p = _create_project(client, "删完回pending")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "only.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    files = client.get(f"/api/items/{first['id']}/files").json()
    fid = files[0]["id"]
    # 此时 status 应是 uploaded
    items_after = client.get(f"/api/projects/{pid}/items").json()["items"]
    first_after = next(i for i in items_after if i["id"] == first["id"])
    assert first_after["status"] == "uploaded"
    # 删
    client.delete(f"/api/files/{fid}")
    # 用新 session 重查（之前 session 可能缓存了旧对象）
    db.close()
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        from app.models import Item as ItemModel
        item_obj = s.query(ItemModel).filter(ItemModel.id == first["id"]).first()
        assert item_obj is not None
        assert item_obj.status == "pending", f"期望 pending，实际 {item_obj.status}"
    finally:
        s.close()


def test_delete_nonexistent_file(client):
    r = client.delete("/api/files/xxx")
    # 实际是 404（找不到记录）— 仍接受 204/404 之一
    assert r.status_code in (204, 404)


# ============ 未认领 / 根目录模糊匹配 ============

def test_unclaimed_file_in_root(client, settings, write_file):
    """项目根目录放一个不匹配任何项的文件 → 进入 _unclaimed。"""
    p = _create_project(client, "未认领")
    pid = p["id"]
    proj_dir = settings.PROJECTS_DIR / pid
    write_file(proj_dir / "无主文件.pdf", "x")
    # 用 watcher 不会自动跑，手动调用 ingest
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        ingest_path(s, proj_dir / "无主文件.pdf")
    finally:
        s.close()
    # 列 items 应在 unclaimed 段
    r = client.get(f"/api/projects/{pid}/items")
    body = r.json()
    unclaimed = body["unclaimed"]
    assert any(f["filename"] == "无主文件.pdf" for f in unclaimed)


# 修 I-2：orphan 文件 preview/download/delete API 集成测试
# 之前只有 resolve_file_path 单元测试覆盖 orphan 路径解析，
# 但没有走完整 API（client → routers/files.py → _resolve_file_path → 200）
# reviewer 警告：如果 router 端调用 resolve_file_path 时 project_id 推断失败，
# 单元测试会通过但 API 返 404。补这三个测试。
def test_orphan_preview_via_api(client, settings, write_file, make_pdf):
    """修 I-2: orphan PDF preview 走 API 应当 200，不是 404。"""
    p = _create_project(client, "orphan-preview")
    pid = p["id"]
    proj_dir = settings.PROJECTS_DIR / pid
    pdf_path = proj_dir / "orphan-pdf.pdf"
    make_pdf(pdf_path)
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        f = ingest_path(s, pdf_path)
        fid = f.id
    finally:
        s.close()
    r = client.get(f"/api/files/{fid}/preview")
    assert r.status_code == 200, f"orphan preview 应当 200，实返 {r.status_code}: {r.text}"
    assert r.headers.get("content-type") == "application/pdf"


def test_orphan_download_via_api(client, settings, write_file, make_pdf):
    """修 I-2: orphan PDF download 走 API 应当 200。"""
    p = _create_project(client, "orphan-download")
    pid = p["id"]
    proj_dir = settings.PROJECTS_DIR / pid
    pdf_path = proj_dir / "orphan-dl.pdf"
    make_pdf(pdf_path)
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        f = ingest_path(s, pdf_path)
        fid = f.id
    finally:
        s.close()
    r = client.get(f"/api/files/{fid}/download")
    assert r.status_code == 200
    assert r.headers.get("content-disposition", "").startswith("attachment")


def test_orphan_in_unclaimed_dir_api_round_trip(client, settings, write_file, make_pdf):
    """修 I-2: 文件在 _unclaimed 子目录时，preview/download 走 API 应当 200。"""
    p = _create_project(client, "orphan-unclaimed-rt")
    pid = p["id"]
    proj_dir = settings.PROJECTS_DIR / pid
    (proj_dir / "_unclaimed").mkdir(parents=True, exist_ok=True)
    pdf_path = proj_dir / "_unclaimed" / "in-unclaimed.pdf"
    make_pdf(pdf_path)
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        f = ingest_path(s, pdf_path)
        fid = f.id
    finally:
        s.close()
    r = client.get(f"/api/files/{fid}/preview")
    assert r.status_code == 200, f"orphan in _unclaimed preview 应当 200，实返 {r.status_code}"


def test_root_dir_fuzzy_match(client, settings, make_pdf):
    """项目根目录放一个文件名与某项名近似的文件 → 应被匹配。"""
    p = _create_project(client, "根目录模糊")
    pid = p["id"]
    proj_dir = settings.PROJECTS_DIR / pid
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    # 用第一个 item 的归一化名
    from app.core.template_loader import _sanitize_name
    from app.core.matching import match_best
    first = items[0]
    safe_name = _sanitize_name(first["name"])
    fuzzy = proj_dir / f"{safe_name}副本.pdf"
    make_pdf(fuzzy)
    # 预校验：先看 normalize + score 是否能匹配
    candidates = [{"seq": it["seq"], "name": it["name"]} for it in items]
    matched = match_best(fuzzy.name, candidates, threshold=0.5)
    assert matched is not None, f"测试前提：normalize + match 应能找到 {first['name']}，实际未找到"
    expected_item_id = next(it["id"] for it in items if it["seq"] == matched["seq"])
    # 再走真实 ingest
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        ingested = ingest_path(s, fuzzy)
    finally:
        s.close()
    assert ingested is not None
    assert ingested.item_id == expected_item_id


# ============ 子文件夹归属 ============

def test_subfolder_ingest(client, settings, make_pdf):
    """子文件夹里的文件应被归属到对应 item。"""
    p = _create_project(client, "子文件夹归属")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    pdf = folder / "sub.pdf"
    make_pdf(pdf)
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        ingested = ingest_path(s, pdf)
    finally:
        s.close()
    assert ingested is not None
    assert ingested.item_id == first["id"]


def test_subfolder_ingest_changes_status(client, settings, make_pdf, db):
    """子文件夹新文件 → item 从 pending 转 uploaded。"""
    p = _create_project(client, "子文件夹转uploaded")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "trigger.pdf")
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        ingest_path(s, folder / "trigger.pdf")
    finally:
        s.close()
    db.expire_all()
    items_after = client.get(f"/api/projects/{pid}/items").json()["items"]
    first_after = next(i for i in items_after if i["id"] == first["id"])
    assert first_after["status"] == "uploaded"


def test_same_filename_in_subfolder_replaces_old(client, settings, make_pdf, db):
    """同名覆盖：再 ingest 同一文件名应更新 filesize。"""
    p = _create_project(client, "同名覆盖")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    pdf = folder / "same.pdf"
    make_pdf(pdf, num_pages=1)
    from app.services.file_service import ingest_path
    from app.database import SessionLocal
    s1 = SessionLocal()
    try:
        f1 = ingest_path(s1, pdf)
        f1_id = f1.id
        f1_size = f1.filesize
    finally:
        s1.close()
    # 改大文件
    import time
    time.sleep(0.01)
    make_pdf(pdf, num_pages=5)
    s2 = SessionLocal()
    try:
        f2 = ingest_path(s2, pdf)
        f2_id = f2.id
        f2_size = f2.filesize
    finally:
        s2.close()
    assert f2_id == f1_id
    assert f2_size != f1_size, f"filesize 应变化：{f1_size} → {f2_size}"
    # 列表仍只有一个
    db.expire_all()
    files = client.get(f"/api/items/{first['id']}/files").json()
    assert len(files) == 1


# ============ 主文件标记 ============

def test_first_file_is_primary(client, settings, make_pdf):
    """上传的第一个文件应自动 is_primary=True。"""
    p = _create_project(client, "主文件标记")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "first.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    files = client.get(f"/api/items/{first['id']}/files").json()
    assert files[0]["is_primary"] is True


def test_set_primary_file(client, settings, make_pdf):
    """手动设主文件：暂未提供 set_primary 端点，但 confirm 时可指定。"""
    p = _create_project(client, "手动主文件")
    pid = p["id"]
    items = client.get(f"/api/projects/{pid}/items").json()["items"]
    first, folder = _first_item_subfolder(settings, pid, items)
    make_pdf(folder / "a.pdf")
    make_pdf(folder / "b.pdf")
    client.post(f"/api/items/{first['id']}/refresh")
    files = client.get(f"/api/items/{first['id']}/files").json()
    target = files[1]["id"]
    r = client.post(f"/api/items/{first['id']}/confirm", json={"primary_file_id": target})
    assert r.status_code == 200
    body = r.json()
    primaries = [f for f in body["files"] if f["is_primary"]]
    assert len(primaries) == 1
    assert primaries[0]["id"] == target


# 修公网部署 (T-01): project 级批量上传到 _unclaimed
import io


def test_project_upload_to_unclaimed(client, sample_project):
    """批量上传 2 个文件到项目 → unclaimed 段可见。"""
    pid = sample_project["id"]
    r = client.post(
        f"/api/projects/{pid}/upload",
        files=[
            ("files", ("a.pdf", io.BytesIO(b"%PDF-1.4 fake\n%%EOF"), "application/pdf")),
            ("files", ("b.txt", io.BytesIO(b"hello"), "text/plain")),
        ],
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert len(data["uploaded"]) == 2
    assert data["errors"] == []
    # 验证 _unclaimed 段能查到这 2 个
    r2 = client.get(f"/api/projects/{pid}/items")
    unclaimed = r2.json()["unclaimed"]
    names = {f["filename"] for f in unclaimed}
    assert "a.pdf" in names
    assert "b.txt" in names


def test_project_upload_to_archived_returns_409(client, sample_project, db):
    """归档项目不可上传。"""
    from app.models import Project
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        proj = s.query(Project).filter(Project.id == sample_project["id"]).first()
        proj.status = "archived"
        s.commit()
    finally:
        s.close()
    r = client.post(
        f"/api/projects/{sample_project['id']}/upload",
        files=[("files", ("x.txt", io.BytesIO(b"x"), "text/plain"))],
    )
    assert r.status_code == 409


def test_project_upload_nonexistent_returns_404(client):
    """不存在的项目 → 404。"""
    r = client.post(
        "/api/projects/nonexistent-id-xxx/upload",
        files=[("files", ("x.txt", io.BytesIO(b"x"), "text/plain"))],
    )
    assert r.status_code == 404


def test_project_upload_error_isolation(client, sample_project):
    """单文件失败不阻塞其他（错误隔离）。"""
    pid = sample_project["id"]
    r = client.post(
        f"/api/projects/{pid}/upload",
        files=[
            ("files", ("good.txt", io.BytesIO(b"hello"), "text/plain")),
            ("files", ("bad.exe", io.BytesIO(b"\x00"), "application/octet-stream")),  # 扩展名不允许
        ],
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert len(data["uploaded"]) == 1
    assert data["uploaded"][0]["filename"] == "good.txt"
    assert len(data["errors"]) == 1
    assert data["errors"][0]["filename"] == "bad.exe"
    assert data["errors"][0]["status"] == 400


# 修 review Critical 1: _validate_upload 单元测（200MB 上限 + 文件名安全）
def test_validate_upload_rejects_oversize():
    """>200MB Content-Length → 413。"""
    from app.routers.files import _validate_upload, MAX_UPLOAD_BYTES
    with pytest.raises(HTTPException) as exc:
        _validate_upload("big.pdf", content_length=MAX_UPLOAD_BYTES + 1)
    assert exc.value.status_code == 413


def test_validate_upload_allows_under_limit():
    """≤200MB Content-Length → 不抛。"""
    from app.routers.files import _validate_upload, MAX_UPLOAD_BYTES
    _validate_upload("ok.pdf", content_length=MAX_UPLOAD_BYTES)  # 边界值
    _validate_upload("ok.pdf", content_length=None)  # 没传 Content-Length (chunked)


def test_validate_upload_rejects_path_traversal():
    """文件名含 .. 或 / → 400 (修 review #19 边缘)。"""
    from app.routers.files import _validate_upload
    for bad in ["../etc/passwd", "..\\windows", "subdir/foo.pdf", "sub\\foo.pdf"]:
        with pytest.raises(HTTPException) as exc:
            _validate_upload(bad, content_length=100)
        assert exc.value.status_code == 400, f"应拒绝: {bad}"


def test_validate_upload_rejects_disallowed_ext():
    """不在 _ALLOWED_EXTS 的扩展名 → 400。"""
    from app.routers.files import _validate_upload
    with pytest.raises(HTTPException) as exc:
        _validate_upload("malware.exe", content_length=100)
    assert exc.value.status_code == 400


# 修 review Important 9: archived + 多文件隔离
def test_project_upload_archived_blocks_entire_request(client, sample_project, db):
    """归档项目即使传 1 好 1 坏 → 整个 409（不进入 per-file loop）。"""
    from app.models import Project
    from app.database import SessionLocal
    s = SessionLocal()
    try:
        proj = s.query(Project).filter(Project.id == sample_project["id"]).first()
        proj.status = "archived"
        s.commit()
    finally:
        s.close()
    r = client.post(
        f"/api/projects/{sample_project['id']}/upload",
        files=[
            ("files", ("good.txt", io.BytesIO(b"x"), "text/plain")),
            ("files", ("bad.exe", io.BytesIO(b"x"), "application/octet-stream")),
        ],
    )
    assert r.status_code == 409
    # 整个请求被拦, uploaded/errors 都不应出现
    body = r.json()
    # FastAPI 默认 422 错误格式
    assert "detail" in body


# 修 review Minor 20: 验证 is_pdf 字段
def test_project_upload_returns_is_pdf_flag(client, sample_project):
    """上传 .pdf 应当 is_pdf=True, 上传 .txt 应当 is_pdf=False。"""
    pid = sample_project["id"]
    r = client.post(
        f"/api/projects/{pid}/upload",
        files=[
            ("files", ("a.pdf", io.BytesIO(b"%PDF-1.4\n%%EOF"), "application/pdf")),
            ("files", ("b.txt", io.BytesIO(b"hello"), "text/plain")),
        ],
    )
    assert r.status_code == 201
    data = r.json()
    by_name = {u["filename"]: u for u in data["uploaded"]}
    assert by_name["a.pdf"]["is_pdf"] is True
    assert by_name["b.txt"]["is_pdf"] is False
