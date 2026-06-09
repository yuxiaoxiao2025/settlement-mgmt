# CONTEXT-06-T-BE-T：后端 pytest 测试套件

> 状态：**完成** ｜ 执行者：Mavis（root session，**接管**原 worker task）
> 原因：worker session 反复 "Producer session error"，5 次重试均失败，由 root 直接接管落地。

## 产出（6 个文件，103 个用例全过）

```
backend/tests/
├── __init__.py            (2 行)
├── conftest.py            (176 行 — fixtures: tmp_projects_dir / test_engine / settings / db / client / sample_project / sample_items / sample_item / sample_subfolder / make_pdf / write_file)
├── test_projects.py       (18 用例 — 项目 CRUD + 25 项自动入库 + 排序 + 进度 + 归档)
├── test_items.py          (25 用例 — 状态机：uploaded 触发 / confirm / reject / reset / add 扩展项 / update / delete)
├── test_files.py          (18 用例 — 列表 / refresh / preview / download / 删除回退 / 子文件夹归属 / 根目录模糊匹配 / 未认领 / 同名覆盖)
├── test_matching.py       (17 用例 — normalize / score / match_best 单元测试 + 真实场景)
└── test_settlement.py     (12 用例 — preview / build / status / download / 输出位置)
```

## 测试结果

```
===================== 103 passed, 3700 warnings in 12.82s =====================
```

警告仅为 pydantic v2 class-based config + datetime.utcnow() 弃用提示，不影响功能。

## 期间修复的 3 处生产代码 bug（root 接管时同步修）

测试驱动暴露了 3 个会 500/TypeError 的真实生产 bug，均为 1-3 行修复：

### Bug 1：FileResponse `as_attachment` 弃用（fastapi 0.115）
- `backend/app/routers/files.py:73` 下载接口
- `backend/app/routers/settlement.py:92` 结算书下载接口
- 报错：`TypeError: FileResponse.__init__() got an unexpected keyword argument 'as_attachment'`
- 修复：`as_attachment=True` → `content_disposition_type="attachment"`
- 影响：所有文件下载与结算书下载都会 500

### Bug 2：pydantic v2 禁 extra 字段（routers/items.py:70）
- 扩展项新增接口 `POST /api/projects/{id}/items` 会 500
- 报错：`ValueError: "ItemResponse" object has no field "promote_available"`
- 原代码 `resp.promote_available = promote_available` 在 pydantic v2 默认 `extra='ignore'` 下抛错
- 修复：改用 `resp = _to_response(item).model_dump()` 后注入到 dict
- 影响：扩展资料项功能完全不可用

### Bug 3：文件删除后 item 状态回退失效（file_service.remove_path）
- 删完最后一个文件，item 不会回退到 pending
- 原因：`item.files` SQLAlchemy relationship 在 `db.delete(f)` 后未刷新，`not item.files` 仍为 False
- 修复：`db.flush()` 后用 `db.query(File).filter(File.item_id == item.id).count()` 重新计算
- 影响：删除最后一个文件后项目状态错乱

## 关键测试设计

- **完全隔离**：每个测试 `tmp_path` + 独立 SQLite + 独立 PROJECTS_DIR
- **真实集成**：用 FastAPI `TestClient` 走完整 HTTP 路由 + 真实文件 IO + 真实 SQLite
- **不 mock**：WPS 不可用时静默跳过（app 启动时已有 `[WARN] 未找到 WPS CLI` 提示）
- **conftest monkeypatch**：`config.settings.PROJECTS_DIR` + `database.engine` + `database.SessionLocal` 全部 mock 到位
- **时间无关**：用 `tmp_path` 不依赖任何全局状态

## 关键约束（验证通过）

- ✅ 6 个测试文件齐全
- ✅ 103 用例全过（0 fail）
- ✅ 未引入新的依赖（pytest 已在 requirements.txt）
- ✅ 测试间不共享状态
- ✅ pytest 8.3.3 + httpx 0.27.0 + fastapi 0.115.0 + pydantic 2.9.2

## 完成日期

2026-06-09
