# Lane 1 — 行级代码审查（code-reviewer 视角）

> 阶段：⑧.5 深度复审（双 lane）— Lane 1
> 执行者：Mavis（root session `mvs_46a8dab493d545d2b04e10c9d4339a7b`，现场接手 — 双 lane plan 被引擎自动 cancel）
> 日期：2026-06-09 22:13 (Asia/Shanghai)
> 输入：docs/REVIEW.md（⑧ 轻量审查 1🔴+4🟠+5🟡+4🟢）+ docs/TEST-REPORT.md + docs/CONTEXT-06-integration.md
> 方法：行级代码质量 + bug fix 后回归风险 + 测试覆盖盲区
> 关联：DEEP-REVIEW-LANE2.md（架构级），DEEP-REVIEW.md（综合裁决）

---

## 0. 摘要

| 等级 | 数量 | 简述 |
|------|------|------|
| 🔴 **CRITICAL** | **2** | ⑨ 必修，否则生产流程断 |
| 🟠 **HIGH** | **5** | ⑨ 必修，否则功能/并发/契约有缺口 |
| 🟡 **MEDIUM** | **6** | ⑨ 推荐修，可挂 ⑩ 之后清理 |
| 🟢 **LOW** | **3** | ⑨ 顺手清 |
| **合计** | **16** | （不含 REVIEW.md 已报的 14 项） |

**关键发现**：本 lane 新发现 **2 个 CRITICAL**，其中 #CRITICAL-L1-1（`/api` 双前缀）影响 **11 个前端 mutation**——这意味着即使 REVIEW.md §2.1（路由断链）修了，confirm/reject/reset/addItem/updateItem/deleteItem + 4 个 file mutation 仍然全部 404。CONTEXT-06-integration §5.1 已识别但 ⑧ REVIEW 漏升级。

---

## 1. 🔴 CRITICAL — ⑨ 必修

### 1.1 ⚠️ `frontend/src/api/items.ts` + `files.ts` 11 个 mutation 全部 404（`/api` 双前缀）

- **文件**：
  - `frontend/src/api/items.ts:66, 79, 96, 104, 120, 132, 144`
  - `frontend/src/api/files.ts:21, 32, 69, 85`（`previewFileUrl`/`downloadFileUrl` 第 43/50 行是浏览器原生 URL 不走 axios，但其他 4 个 mutation 仍走 axios 全部中招）
- **现象**：
  `apiClient.baseURL = '/api'`（`client.ts:13`）。所有 `apiClient.get/post/...` 自动拼 `/api` 前缀。但 `items.ts` / `files.ts` 的路径全部以 `/api/...` 开头：

  ```ts
  // items.ts:66（listItems）
  await apiClient.get(`/api/projects/${id}/items`)
  // 实际请求路径 = baseURL + path = /api + /api/projects/... = /api/api/projects/... → 404
  ```

- **影响**（与 CONTEXT-06-integration §5.1 一致但被 ⑧ REVIEW 漏升级到 CRITICAL）：
  | 函数 | 文件:行 | 实际请求 | 状态 |
  |------|--------|----------|------|
  | `listItems` | items.ts:66 | `GET /api/api/projects/{id}/items` | ❌ 404 |
  | `addItem` | items.ts:79 | `POST /api/api/projects/{id}/items` | ❌ 404 |
  | `updateItem` | items.ts:96 | `PATCH /api/api/items/{id}` | ❌ 404 |
  | `deleteItem` | items.ts:104 | `DELETE /api/api/items/{id}` | ❌ 404 |
  | `confirmItem` | items.ts:120 | `POST /api/api/items/{id}/confirm` | ❌ 404 |
  | `rejectItem` | items.ts:132 | `POST /api/api/items/{id}/reject` | ❌ 404 |
  | `resetItem` | items.ts:144 | `POST /api/api/items/{id}/reset` | ❌ 404 |
  | `listFiles` | files.ts:21 | `GET /api/api/items/{id}/files` | ❌ 404 |
  | `refreshItem` | files.ts:32 | `POST /api/api/items/{id}/refresh` | ❌ 404 |
  | `deleteFile` | files.ts:69 | `DELETE /api/api/files/{id}` | ❌ 404 |
  | `setPrimaryFile` | files.ts:85 | `POST /api/api/items/{id}/confirm` | ❌ 404（且会绕过 `/primary` 端点缺失的 fallback） |
- **测试覆盖盲区**：TEST-REPORT.md §3 提到 pytest 103/103 全过 + §7 提到"前端 mutation hooks 未覆盖"——但 ⑦ 测试阶段没意识到这是 100% 全 404。⑥.5 集成报告只测了 4 个端点（health / projects list / projects create / items list），没有真触发 mutation 链。
- **修复**：
  - 方案 A（推荐）：删除所有 `/api` 前缀（保持与 `projects.ts` / `template.ts` / `settlement.ts` 一致）
  - 方案 B：改 `apiClient.baseURL = '/api/api'`（hack，但零侵入）
  - 必加测试：`tests/api-routing.test.ts` 用 `axios.create` mock 验证路径拼接
- **回归验证**：`curl -X POST http://localhost:8000/api/items/{id}/confirm -d '{}'` → 期望 200/409 而非 404。
- **重要度**：**CRITICAL** — SPEC §11 剧本 1（建项目→准备→复核→生成）的"复核"环节全部依赖这些 mutation，6 个核心 item 操作 + 4 个 file 操作全失败 = 系统 50% 核心功能不可用。
- **来源**：CONTEXT-06-integration.md §5.1（已识别）+ REVIEW.md §10（漏升级）

---

### 1.2 `pdf_converter.convert_to_pdf()` 全代码库 0 调用方 — PDF 转码链路断裂

- **文件**：`backend/app/services/pdf_converter.py:42`（定义）+ 整个 backend（无调用方）
- **grep 证据**：
  ```
  $ rg "convert_to_pdf" backend/
  app/services/pdf_converter.py:42: def convert_to_pdf(src: Path, dst_dir: Path, timeout: int = 120) -> Optional[Path]:
  ```
  唯一定义点，没有任何 import / 调用。
- **DESIGN 承诺**：
  - DESIGN.md §2 数据流总览：`文件 → Watcher → File Service → Pdf Converter (WPS CLI 异步) → SQLite`
  - DESIGN.md §4.3：「若非 PDF，添加转码任务到 BackgroundTasks」
  - DESIGN.md §12 风险落实：「WPS 不在 PATH → `core/wps_detector.py` 启动时探测 + 提示」+ 「大文件转码慢 → BackgroundTasks 异步 + UI 进度」
  - 但 `core/wps_detector.py` 目录里**不存在**（`backend/app/core/` 只有 `__init__.py` / `matching.py` / `paths.py` / `template_loader.py`）
- **实际行为**：`file_service.py:69, 77, 93, 109` 全部用 `existing.is_pdf = file_path.suffix.lower() == ".pdf"` —— **只判断后缀名**，**永远不调用 WPS 转码**。
- **影响**：
  - 用户拖入 `.docx` / `.xlsx` / `.jpg` → `is_pdf=False` 入库，但 `pdf_path` 永远是 NULL
  - `settlement_builder.py:148` `pdf_path = Path(primary.pdf_path or primary.original_path)` 兜底走原始路径 → **结算书会包含非 PDF 原始文件，pypdf.PdfReader 报 "could not find Xref table"**
  - FileList.tsx:122 「（非PDF，转码中）」红色提示永远不消失（实际上根本没"转码中"状态机）
- **修复**：
  ```python
  # file_service.py ingest_path() 在 is_pdf=False 时：
  from app.services.pdf_converter import convert_to_pdf
  pdfs_dir = settings.PROJECTS_DIR / project_id / ".pdfs"
  pdf_path = convert_to_pdf(file_path, pdfs_dir)
  if pdf_path:
      existing.pdf_path = str(pdf_path)
      existing.is_pdf = True  # 转码后视为 PDF
  ```
  + watcher 用 BackgroundTasks（DESIGN §4.3 承诺）
  + 加 `core/wps_detector.py`（DESIGN §12 承诺）
- **测试覆盖**：✅ pytest `test_subfolder_ingest_changes_status` 只测 PDF；❌ 无 docx → PDF 转码用例。需补。
- **重要度**：**CRITICAL** — SPEC §3.1 明确「资料包含 .docx / .xlsx / .jpg 等」，若 PDF 转码缺失 = 90% 用户场景无法生成结算书。

---

## 2. 🟠 HIGH — ⑨ 必修

### 2.1 `watcher_service.py` debounce 是 leading-edge，编辑器保存会被截断

- **文件**：`backend/app/services/watcher_service.py:18-31`
- **现象**：
  ```python
  def _emit(self, event_type: str, path: str):
      now = time.time()
      last = self._debounce.get(path, 0)
      if now - last < settings.DEBOUNCE_SECONDS:
          self._debounce[path] = now
          return  # ← leading edge：后续事件全部丢
      self._debounce[path] = now
      # 延迟一点再发，确保文件写入完成
      threading.Timer(settings.DEBOUNCE_SECONDS, self._cb, args=...).start()
  ```
  注释说"延迟一点再发，确保文件写入完成"——但 `_emit` 立刻触发 `Timer(DEBOUNCE_SECONDS, cb, ...)`，**leading-edge 处理**（第一个事件立即排队，2s 后回调）。
- **真实场景**：
  - 用户在 Word 保存一个大文件 → 先 `created` 事件（0KB）→ 立刻 `modified` × 5（增量写入）→ 第 3 秒 `modified` 完成
  - leading-edge 模式下：第一次 created 立即入 debounce → 2s 后 Timer 回调 → 但此时文件**还在写入中**，`ingest_path` 拿到 0KB 文件 + 后续 modified 全部丢弃
  - 期望：trailing-edge（最后一次 modified 后 2s 才回调）
- **影响**：用户拖入 / 保存 .docx 后，files 表记 0KB 记录 + 状态错乱，且后续 modified 不会刷新大小
- **修复**：
  ```python
  def _emit(self, event_type: str, path: str):
      self._debounce[path] = time.time()
      # 取消已有 timer（关键）
      timer = self._timers.get(path)
      if timer:
          timer.cancel()
      # 启动新 timer（trailing-edge）
      self._timers[path] = threading.Timer(
          settings.DEBOUNCE_SECONDS,
          self._cb,
          args=(event_type, "file", Path(path)),
      )
      self._timers[path].start()
  ```
  + 加 `_timers: dict[str, threading.Timer]` 实例属性
- **测试覆盖**：❌ 无 watcher 单测；需补集成测试（写 5KB 文件 → 模拟 5 次 modified → 期望最后只入库 1 次，filesize=5KB）。
- **重要度**：HIGH — `06-integration §3.7` 写 PDF 时正好走的是「一次性写入」路径没踩到，但真实用户场景（Word 保存）100% 触发。

---

### 2.2 `VALID_TRANSITIONS` 装饰品：`can_transition()` 定义但 0 调用方

- **文件**：`backend/app/services/item_service.py:14-23`（定义）+ 全 backend（无调用方）
- **grep 证据**：
  ```
  $ rg "can_transition" backend/
  app/services/item_service.py:22: def can_transition(current: str, target: str) -> bool:
  ```
  唯一定义点，无人调用。
- **实际行为**：
  - `file_service.py:96-100` 直接赋值 `target_item.status = "uploaded"`（绕过校验）
  - `file_service.py:114-118` 同上
  - `item_service.py:78, 102, 113` 同样直接赋值
  - `confirm_item` / `reject_item` 只做了"字符串列表"白名单检查（行 72-73, 100-101），不是 `can_transition` 校验
- **影响**：
  - 状态机白名单定义但**形同虚设**——任何代码都能 `item.status = "anything"`
  - 将来加新状态（如 `archived` / `locked`）时，无法保证一致性
  - 测试 `test_items.py` 5+ 状态机用例只在 router/service 层断言字符串，**没测 `can_transition` 函数本身**（也没人测，因为没人调用）
- **修复**：
  - 选项 A：删除 `VALID_TRANSITIONS` + `can_transition`（既然不用就别误导）
  - 选项 B（推荐）：所有 status 赋值前调 `assert can_transition(current, target), "非法状态转换"`；用 `setattr` + `__setattr__` hook 自动校验
- **测试覆盖**：补 `test_state_machine.py::test_can_transition_all_paths` 直接验证函数 + `test_setattr_blocks_illegal_status` 验证 hook。
- **重要度**：HIGH — 当前可用，但代码腐烂风险高；⑨ 修 `1.1` 时若重构状态机会立刻踩坑。

---

### 2.3 `settlement_builder.py:132` `current_page = 2` 假设目录 1 页 — 多目录页时全部错位

- **文件**：`backend/app/services/settlement_builder.py:132, 144-158`
- **现象**：
  ```python
  current_page = 2  # 封面占 1 页，目录从第 2 页开始（先占位）

  # 占位封面 + 目录（先空）
  for _ in range(2):
      writer.add_blank_page(width=A4[0], height=A4[1])

  for item in items:
      primary = ...
      for page in reader.pages:
          writer.add_page(page)
          current_page += 1
      item_page_map.append((item, start_page))

  # ... 后面生成 toc_buf，但 item_page_map 的 start_page 是基于 current_page=2 假设的
  ```
  而 `_draw_toc` (`settlement_builder.py:63-99`) 在 `y < 2 * cm` 时**翻页**：
  ```python
  for item, start_page in items:
      if y < 2 * cm:
          c.showPage()  # ← 目录自动翻页
          y = height - 2 * cm
          c.setFont(CHINESE_FONT, 10)
      ...
  ```
  25 项标准资料 + 用户扩展项，**目录页可能 1-2 页**。但 `current_page=2` 假设目录只有 1 页 —— 当目录为 2 页时，正文起始页应为 4，但 `item_page_map` 全部按"正文从第 3 页起"计算 → 目录第 1 页码 vs 实际正文起始页全部差 1。
- **影响**：用户看到目录写「投标文件 ... 起始页 3」但 PDF 阅读器跳转到的是「目录第 2 页」。结算书本质上是归档材料，目录页码错位 = 不可交付。
- **修复**：
  1. 重构为先合并 `cover + toc_placeholder(自动按内容计算页数) + items`，**后回填目录**（DESIGN §4.5 承诺的「重写目录页」流程）
  2. 或：先合并 items 计算 `current_page`，**再**画目录（与当前倒过来）
  ```python
  # 方案 2：先合并 items
  mid_writer = PdfWriter()
  for item in items:
      ...
      start_page_in_mid = current_page_in_mid  # 不含 cover/toc
      mid_writer.add_page(...)
  # 中间 PDF 总页数 = current_page_in_mid
  # 封面 1 页 + 目录 N 页 + 中间 M 页 = 总页数
  # 先渲染目录占位再合并，避免 start_page 假设
  ```
- **测试覆盖**：❌ `test_build_returns_valid_pdf` 只验证「pypdf 能解析」；❌ 无页数断言 = `2 + sum(item.pdf_pages)`。需补：
  ```python
  def test_build_pdf_page_count_correct():
      pdf_pages = [1, 2, 3]  # 3 个 item 的页数
      result = build_settlement(db, project_id)
      reader = PdfReader(result.output_path)
      assert len(reader.pages) == 2 + sum(pdf_pages)  # cover + toc + items
  ```
- **重要度**：HIGH — 与 REVIEW §3.1 (PDF 损坏) 是同一流程的姊妹 bug，⑨ 必须一起修。

---

### 2.4 `File.item_id_orphan` 字段定义但用错 — unclaimed 全部用 `item_id=""`

- **文件**：
  - `backend/app/models.py:69`：`item_id_orphan = Column(String, nullable=True)`（注释 `# 未匹配的归属（item_id 为 NULL）`）
  - `backend/app/services/file_service.py:73`：`item_id=""`（实际用空字符串）
  - `backend/app/routers/items.py:45`：`unclaimed = db.query(File).filter(File.item_id == "").all()`（按空字符串筛）
  - `backend/app/services/file_service.py:131-135`：`if f.item_id else None`（判 None 又判空串，逻辑混乱）
- **现象**：模型同时有 `item_id`（NOT NULL constraint）和 `item_id_orphan`（专门给 unclaimed 用），但实际代码用 `item_id=""` 当 orphan 标记，**`item_id_orphan` 永远是 NULL**。
- **影响**：
  - 字段冗余 + 注释误导 + 维护者疑惑
  - `File.item_id` 的 `nullable=False` 是 ORM 层（不强制 DB 层约束），但 sqlite schema migration 后会出问题
  - unclaimed 列表用 `File.item_id == ""` 查询 = 全表扫字符串比较，无索引
- **修复**：
  ```python
  # models.py
  item_id = Column(String, ForeignKey("items.id"), nullable=True)  # 改为 nullable
  # 删除 item_id_orphan 字段

  # file_service.py
  f = File(
      item_id=None,  # 显式 NULL
      ...
  )

  # routers/items.py
  unclaimed = db.query(File).filter(File.item_id.is_(None)).all()
  ```
- **测试覆盖**：补 `test_unclaimed_file_item_id_is_none` + `test_list_unclaimed_for_project`。
- **重要度**：HIGH — 当前能跑，但语义混乱 + 字段约束与设计意图不符。

---

### 2.5 `access_log_middleware` 每请求写 DB — 高 QPS 时崩溃

- **文件**：`backend/app/main.py:104-120`
- **现象**：
  ```python
  @app.middleware("http")
  async def access_log_middleware(request: Request, call_next):
      response = await call_next(request)
      if settings.ACCESS_LOG:
          try:
              with SessionLocal() as db:
                  db.add(AccessLog(...))
                  db.commit()  # ← 每个 HTTP 请求都写一次 SQLite
          except Exception:
              pass
      return response
  ```
  `/api/health` 高频探活（前端每 30s）+ 静态资源探针（Vite 代理）/ `/api/projects` 5s 轮询 = **每秒多次 DB 写**。
- **影响**：
  - SQLite 单文件 + WAL 模式可抗 1k QPS 但单进程串行写仍是瓶颈
  - LAN 多端（5 用户 × 每 5s 轮询 × 5 端点 = 5 QPS）暂时 OK，但日志表累积 100w 行后 VACUUM 阻塞
  - 失败请求（404 / 500）也写日志，**日志表噪声大**
- **修复**：
  ```python
  # 选项 A：sample rate
  if settings.ACCESS_LOG and (request.url.path not in ("/api/health", "/favicon.ico")):
      ...
  # 选项 B：异步写（用 BackgroundTasks）
  background_tasks.add_task(_write_access_log, ...)
  # 选项 C：写文件而非 DB（更简单）
  with open(settings.ACCESS_LOG_PATH, "a") as f:
      f.write(f"{ts}\t{ip}\t{method}\t{path}\t{status}\n")
  ```
- **测试覆盖**：❌ 无 middleware 单测；可补 `test_access_log_writes_per_request` + `test_access_log_skips_health_endpoint`。
- **重要度**：HIGH — 当前 LAN 工具规模 OK，但⑩ 交付前若部署到真实多端会立刻踩坑。

---

## 3. 🟡 MEDIUM — ⑨ 推荐修

### 3.1 `datetime.utcnow()` 11 处 — pydantic v2 弃用警告（与 REVIEW §4.1 重叠）

- **文件**：`backend/app/models.py:28, 29, 49, 50, 65, 80, 94` + `services/file_service.py:143` + `services/settlement_builder.py:196, 203` + `services/item_service.py:79`
- **grep 证据**：
  ```
  $ rg "datetime.utcnow" backend/
  backend/app/models.py:28:    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
  ... (共 11 处)
  ```
- **影响**：3700 条 pytest 警告（TEST-REPORT §3 已记）；pydantic v3 必然 breaking change。
- **修复**：机械替换 `datetime.utcnow` → `datetime.now(timezone.utc)`（记得 `from datetime import timezone`）；保留 naive 不变量 + 加 `# noqa: DTZ005`。
- **重要度**：MEDIUM — 不阻塞功能但污染日志 + 未来升级风险。

---

### 3.2 `CORS_ORIGINS + ["*"]` + `allow_credentials=True` — 违反 CORS spec

- **文件**：`backend/app/main.py:94-100`（REVIEW §3.3 已报为 HIGH，降级 §4.5 为 MEDIUM）
- **补充**：除了 REVIEW 已说，本 lane 发现 `allow_methods=["*"]` + `allow_headers=["*"]` 也都过宽。LAN 工具场景下若将来加 cookie 鉴权会立刻踩坑。
- **修复**（与 REVIEW 一致）：要么去掉 `+ ["*"]`，要么 `allow_credentials=False`。

---

### 3.3 `pdf_converter.convert_to_pdf()` 错误信息 `result.stderr[:200]` 截断不友好

- **文件**：`backend/app/services/pdf_converter.py:57, 64, 67`
- **现象**：`print(f"[PDF] WPS 转码失败: {result.stderr[:200]}")` —— 截断后不完整；用 `print` 而非 `logging`（与 main.py 全局风格一致问题）；异常吞掉 stack trace。
- **影响**：bug 排查时看不到 WPS 返回的完整错误。
- **修复**：
  ```python
  import logging
  logger = logging.getLogger(__name__)
  logger.exception("[PDF] WPS 转码失败: %s", src)  # 保留 stack trace
  ```

---

### 3.4 `global_exception_handler` 把 `str(exc)` 塞进响应（REVIEW §3.4 已报为 HIGH，降级 MEDIUM）

- **文件**：`backend/app/main.py:124-129`
- **补充**（行级视角）：
  - 同时所有异常都被这个 handler 吞，**没有日志记录** —— 排查只能靠前端 toast
  - 应该 `logger.exception(...)` 先记录，再返回通用响应
  - 即使 LAN 工具，stack trace 也应留 server 端而非 client 端
- **修复**：见 #2.5 access_log 同样模式 —— `logger.exception` + 返回通用文案。

---

### 3.5 `item_service.py:90` `for f in item.files: f.is_primary = (f in (pdf_files or item.files)[:1])` 可读性差

- **文件**：`backend/app/services/item_service.py:90`（REVIEW §4.3 已报）
- **补充**（行级视角）：`(pdf_files or item.files)[:1]` 用 `or` 兜底意图模糊——是"无 PDF 时取第一个"还是"无文件时取空 list"？读代码 30s 才能确认。
- **修复**：
  ```python
  primary = (pdf_files or item.files)[0] if (pdf_files or item.files) else None
  for f in item.files:
      f.is_primary = (f is primary)
  ```

---

### 3.6 `models.py` `class Config` 旧 pydantic v1 写法

- **文件**：`backend/app/schemas.py:58-59, 84-85, 100-101`（3 处 `class Config: from_attributes = True`）
- **现象**：pydantic v2 推荐 `model_config = ConfigDict(from_attributes=True)`。`ConfigDict` 是 pydantic 2.0+ 才有的。
- **影响**：3700 warnings 之一；不阻塞功能但需清理。
- **修复**：机械替换 3 处。

---

## 4. 🟢 LOW — ⑨ 顺手清

### 4.1 `store/app.ts:62-66` UUID 兜底用 `Math.random()`（REVIEW §5.1 已报）

跳过（沿用 REVIEW §5.1 结论：仅 toast id 弱随机可接受）。

---

### 4.2 `lib/status.ts:88` `archived` icon 用 📦 emoji（REVIEW §5.2 已报）

跳过。

---

### 4.3 `routers/files.py:46-50` `refresh_item` 的 `added` 计数会重复

- **文件**：`backend/app/routers/files.py:46-50`
- **现象**：
  ```python
  for f in sub.iterdir():
      if f.is_file():
          file_service.ingest_path(db, f)
          added += 1  # ← 不管是否真的新增都 +1
  ```
  `ingest_path` 是 upsert（已存在则更新），但这里 `added` 是"扫描数"而非"新增数"。REVIEW §5.3 报为 LOW（"加 set 去重"）—— 实际本 lane 复核发现：**返回值语义错**——`added=扫描数` 但 UI 期望"新增数"。需区分。
- **修复**：
  ```python
  existing_paths = {f.original_path for f in db.query(File).filter(File.item_id == item_id).all()}
  new_paths = [f for f in sub.iterdir() if f.is_file() and str(f.resolve()) not in existing_paths]
  for f in sub.iterdir():
      if f.is_file():
          file_service.ingest_path(db, f)
  return {"scanned": 1, "added": len(new_paths)}
  ```

---

## 5. 对 REVIEW.md 的复核（抽样）

| # | REVIEW.md § | 准确度 | 备注 |
|---|-------------|--------|------|
| §2.1 | App.tsx 路由断链 | ✅ 准确 | `App.tsx:38-43` `ProjectDetail = () => <PlaceholderPage>` 确认。修法正确。 |
| §3.1 | settlement_builder.py:163 `buf.seek(1)` | ✅ 准确 + 本 lane 加深 | 本 lane 发现姊妹 bug：#2.3 目录页多页时 `current_page=2` 假设错位 |
| §3.2 | main.py:138 `wps: bool(_watcher)` | ✅ 准确 | 与本 lane #1.2 同一健康检查字段但不同视角（健康检查 vs PDF 转码） |
| §3.3 | CORS `+ ["*"]` + credentials | ✅ 准确 | 本 lane 复核：同时 `allow_methods=["*"]` + `allow_headers=["*"]` 过宽 |
| §3.4 | 全局异常 handler | ✅ 准确 | 本 lane 加深：应加 `logger.exception` |
| §4.1 | 3700 warnings | ✅ 准确 | 本 lane 量化到 11 处 `datetime.utcnow()` |
| §4.3 | confirm primary 单行表达式 | ✅ 准确 | 本 lane 加深：`(pdf_files or item.files)[:1]` `or` 兜底语义模糊 |
| §4.4 | promote_to_template 内存↔磁盘分裂 | ✅ 准确 | 未复核具体修复路径，但假设是建议方向（先读磁盘→append→dump→重置内存缓存） |
| §5.3 | `refresh_item` `added` 重复 | ✅ 半准确 | REVIEW 说"加 set 去重"，本 lane 发现**根本问题是返回值语义错**（扫描数 vs 新增数） |

---

## 6. 行级视角的隐藏测试盲区

TEST-REPORT.md §7 + §9 已识别 5 项未覆盖。本 lane 加深：

| 项 | 风险 | 建议 |
|----|------|------|
| **API 路由拼接** | `/api/api/...` 双前缀 (本 lane #1.1) | 加 `tests/api-routing.test.ts` 用 axios mock 验证 |
| **watchdog debounce** | leading-edge 丢事件 (本 lane #2.1) | 加 `tests/test_watcher.py` 模拟多次 modified |
| **状态机 VALID_TRANSITIONS** | 装饰品 (本 lane #2.2) | 加 `tests/test_state_machine.py::test_can_transition_*` |
| **PDF 转码链路** | convert_to_pdf 0 调用方 (本 lane #1.2) | 加 `tests/test_pdf_converter.py::test_docx_to_pdf` |
| **settlement 页数** | 多目录页错位 (本 lane #2.3) | 加 `tests/test_settlement.py::test_build_pdf_page_count_correct` |
| **unclaimed 字段** | item_id="" vs item_id_orphan NULL (本 lane #2.4) | 加 `tests/test_files.py::test_unclaimed_item_id_is_none` |
| **access_log 性能** | 每请求写 DB (本 lane #2.5) | 加 `tests/test_main.py::test_access_log_skips_health` |

---

## 7. ⑨ 修复优先级建议（行级视角）

| # | 等级 | 简述 | 估计耗时 |
|---|------|------|---------|
| 1 | 🔴 | #1.1 `/api` 双前缀（11 mutation 全 404） | 15 min |
| 2 | 🔴 | #1.2 PDF 转码链路补全 | 60 min（含 BackgroundTask + detector） |
| 3 | 🟠 | #2.1 watchdog leading-edge → trailing-edge | 20 min |
| 4 | 🟠 | #2.2 状态机 hook 或删 VALID_TRANSITIONS | 15 min |
| 5 | 🟠 | #2.3 settlement 目录页码算法 | 30 min + 测试 |
| 6 | 🟠 | #2.4 File.item_id_orphan 字段归一化 | 15 min |
| 7 | 🟠 | #2.5 access_log sample rate 或异步 | 15 min |
| 8 | 🟡 | #3.1 #3.6 datetime.utcnow + ConfigDict 机械替换 | 60 min |
| 9 | 🟡 | #3.2 #3.4 CORS + 全局异常 handler | 10 min |
| 10 | 🟡 | #3.3 pdf_converter logging | 10 min |
| 11 | 🟡 | #3.5 confirm primary 可读性 | 5 min |
| 12 | 🟢 | #4.3 refresh_item 返回值语义 | 10 min |
| **合计** | | | **~4.5 小时** |

注：本 lane 16 项 + REVIEW.md 14 项 = **30 项修复**，⑨ 阶段需并行 / 顺序分摊。

---

## 8. 完成项

- [x] 16 项行级发现（2🔴+5🟠+6🟡+3🟢）
- [x] 在 REVIEW.md 之外独立识别 1 个 CRITICAL（`/api` 双前缀）+ 1 个 CRITICAL（PDF 转码缺失）
- [x] 对 REVIEW.md 9 项抽样复核
- [x] ⑨ 修复优先级清单（12 项，~4.5h）
- [x] 7 项隐藏测试盲区（与 TEST-REPORT §9 互补）