# Lane 2 — 架构级审查（architect 视角）

> 阶段：⑧.5 深度复审（双 lane）— Lane 2
> 执行者：Mavis（root session `mvs_46a8dab493d545d2b04e10c9d4339a7b`，现场接手 — 双 lane plan 被引擎自动 cancel）
> 日期：2026-06-09 22:18 (Asia/Shanghai)
> 输入：docs/DESIGN.md（架构基线）+ docs/SPEC.md + docs/REVIEW.md + docs/CONTEXT-06-integration.md + 关键源文件
> 方法：DESIGN 承诺 vs 实际实现差距 + 5 轴架构视角（Architecture / Security / Extensibility / Data Flow / Failure Mode）
> 关联：DEEP-REVIEW-LANE1.md（行级），DEEP-REVIEW.md（综合裁决）

---

## 0. 摘要

| 等级 | 数量 | 简述 |
|------|------|------|
| 🔴 **CRITICAL** | **3** | ⑨ 必修，否则架构与设计意图背离 |
| 🟠 **HIGH** | **6** | ⑨ 必修，否则扩展性 / 可观测性 / 信任边界有缺口 |
| 🟡 **MEDIUM** | **5** | ⑨ 推荐修，可挂 ⑩ |
| 🟢 **LOW** | **2** | ⑨ 顺手清 |
| **合计** | **16** | （含与 Lane 1 视角互补的发现） |

**关键发现**：本 lane 识别 **3 个 DESIGN 承诺但代码未实现的架构缺口**（repositories 层缺失 / PDF 转码链路断裂 / APScheduler 兜底轮询缺失），加 **3 个架构级隐患**（VALID_TRANSITIONS 装饰品 / 单一职责违反 / 路由前缀风格不统一），这些是 REVIEW.md 浅度阅读漏报的系统性问题。

---

## 1. 🔴 CRITICAL — DESIGN 承诺 vs 实际实现

### 1.1 DESIGN §2/§3 承诺的 `repositories/` 层完全缺失 — services 直连 SQLAlchemy

- **DESIGN 承诺**：
  - DESIGN.md §2 架构图：`Services → Repositories（数据访问层）→ SQLite`
  - DESIGN.md §3 目录结构：`repositories/__init__.py` + `project_repo.py` + `item_repo.py` + `file_repo.py`
  - DESIGN.md §6 数据流：`projects 表 / items 表 / files 表` 由 Repositories 层封装
- **实际实现**：`backend/app/repositories/` 目录**不存在**（验证：`ls backend/app/` 只有 `core/ routers/ services/`）
- **services 直连 SQLAlchemy**：
  - `services/project_service.py` — `db.query(Project).filter(...)` 直接出现
  - `services/item_service.py` — `db.query(Item).filter(...)` 多次
  - `services/file_service.py` — `db.query(File).filter(...)` 多次
  - `services/settlement_builder.py` — `db.query(Project).filter(...).first()`
  - `routers/items.py:45` `db.query(File).filter(File.item_id == "")` —— **router 层直接 query，绕过 service 层**
- **影响**：
  - 业务规则散落在 router / service 两层（如 router 直接 query File 表，绕过 file_service 的 unclaimed 逻辑）
  - DB schema 升级时需要 grep 全代码库，无法一处改
  - 测试无法 mock DB（必须用真实 sqlite）
  - 单元测试 conftest 必须每次建 DB + 表，慢
- **修复**：
  ```
  backend/app/repositories/
  ├── __init__.py
  ├── project_repo.py    # create / get / list / update / archive
  ├── item_repo.py       # create / get / list / confirm / reject / reset / promote
  └── file_repo.py       # upsert / list_for_item / list_unclaimed / delete
  ```
  + service 改为调用 repo：`project_service.create_project()` → `project_repo.create(db, payload)` + `item_repo.bulk_create(db, items)`
  + router 改为只调 service（不再直连 db）
- **工作量**：~3-4 小时（机械搬迁 + 重写 service 签名 + 调 router）
- **重要度**：**CRITICAL** —— 这是架构"基线"级缺口，不是 bug 是债务。⑨ 必修，否则后续所有扩展（加缓存 / 加审计日志 / 换 ORM）成本 2x。

---

### 1.2 DESIGN §4.3 / §12 承诺的 PDF 转码链路完全未集成

- **DESIGN 承诺**：
  - DESIGN.md §2 数据流：`文件 → Watcher → File Service → Pdf Converter (WPS CLI 异步) → SQLite`
  - DESIGN.md §4.3：「若非 PDF，添加转码任务到 BackgroundTasks」
  - DESIGN.md §12 风险落实：
    - 「WPS 不在 PATH → `core/wps_detector.py` 启动时探测 + 提示」
    - 「大文件转码慢 → BackgroundTasks 异步 + UI 进度」
- **实际实现**：
  - `services/pdf_converter.py` 定义了 `convert_to_pdf()` 但**全代码库 0 调用方**（与 Lane 1 #CRITICAL-1.2 同一发现，架构视角）
  - `core/wps_detector.py` **目录里不存在**（`backend/app/core/` 只有 `__init__.py` `matching.py` `paths.py` `template_loader.py`）
  - `file_service.py` 只判后缀名 → 非 PDF 文件入库后永远不被转码
  - DESGIN §12 承诺的 UI 进度条 / 转码状态机都未实现
- **影响**（架构视角补充 Lane 1）：
  - 整个「文件 → PDF」流程架构上断裂
  - 用户拖入 docx → 入库为「非 PDF」 → settlement 时拿不到 PDF → pypdf 解析失败 → 用户看不到错误在哪一步（提示只说"PDF 损坏"）
  - 没有 watchdog → 转码 的并发设计，单 worker 转码会被同步吞
- **修复**（架构级）：
  1. 创建 `core/wps_detector.py`：启动时探测 WPS 路径 + health check 用
  2. 修改 `file_service.ingest_path()`：检测非 PDF → 标 `is_pdf=False` → 入库后**同步触发** BackgroundTasks 转码
  3. 引入转码状态机：`pending_upload → converting → converted → failed`（file 表加 `convert_status` + `converted_at`）
  4. FileList.tsx UI：根据 `convert_status` 显示「转码中 / 失败 / 重试」按钮
- **工作量**：~2-3 小时（含 BackgroundTask 接入 + 状态机加字段 + UI 状态 + detector）
- **重要度**：**CRITICAL** —— DESIGN 基线功能，缺失 = SPEC §3.1 半数场景不可用

---

### 1.3 DESIGN §5.2 承诺的 APScheduler 兜底轮询完全未实现

- **DESIGN 承诺**：
  - DESIGN.md §5.2：「watchdog observer + 5s 兜底轮询。watchdog 实时、低 CPU；失败时（共享盘/SMB 协议不支持 inotify）APScheduler 兜底」
  - DESIGN.md §9 配置：`WATCHDOG_FALLBACK_POLL: int = 5`
- **实际实现**：
  - `config.py:27` 定义了 `WATCHDOG_FALLBACK_POLL: int = 5`
  - `rg WATCHDOG_FALLBACK_POLL backend/` → **唯一定义点，0 引用**
  - `rg APScheduler backend/` → **0 引用**
  - `requirements.txt` 没列 `apscheduler`（验证：grep apscheduler pyproject.toml）
- **影响**：
  - watchdog 在以下场景会**静默失效**：
    - Windows 共享盘 / SMB / NFS 挂载 → watchdog 报 `OSError: ReadDirectoryChangesW failed` → 当前只 `print("[WARN] ...")` 然后 `_available=False`，**用户无感知**
    - 防病毒软件拦截 ReadDirectoryChangesW
  - LAN 工具场景「共享盘归集文件」是核心使用方式 —— 这是设计基线承诺的高可用性
- **修复**：
  ```python
  # watcher_service.py
  class WatcherService:
      def start(self):
          try:
              self._observer = Observer()
              ...
              self._observer.start()
              self._available = True
          except Exception as e:
              logger.warning("watchdog 启动失败: %s", e)
              self._observer = None
              self._start_fallback_poller()

      def _start_fallback_poller(self):
          from apscheduler.schedulers.background import BackgroundScheduler
          self._scheduler = BackgroundScheduler()
          self._scheduler.add_job(
              self._scan_all_projects,
              "interval",
              seconds=settings.WATCHDOG_FALLBACK_POLL,
              id="watchdog_fallback",
          )
          self._scheduler.start()
          self._available = True  # 兜底也算 available
          logger.info("watchdog 不可用，已启动 %ds 兜底轮询", settings.WATCHDOG_FALLBACK_POLL)
  ```
- **依赖**：`pip install apscheduler>=3.10`（DESIGN §1.1 已列）
- **测试覆盖**：补 `tests/test_watcher.py::test_fallback_poller_runs_after_observer_failure`（mock Observer 抛错）
- **重要度**：**CRITICAL** —— LAN 工具核心场景（共享盘）的高可用性保证，缺失 = 「工具在最常见用法下不可靠」

---

## 2. 🟠 HIGH — 架构级隐患

### 2.1 `VALID_TRANSITIONS` 装饰品 — 状态机层定义但未贯穿

- **架构视角补充 Lane 1 #HIGH-2.2**：
  - `item_service.py:14-23` 定义 `VALID_TRANSITIONS` + `can_transition()`
  - 全代码库 `can_transition` **0 调用方**（grep 验证）
  - 所有 status 赋值都是字符串字面量直接 `=`，绕过任何校验
- **架构影响**：
  - 状态机层在系统中**形同虚设**——业务规则与数据模型脱钩
  - 「白名单字符串检查」（item_service.py:72, 100）藏在 service 函数顶部，未来加新状态时容易漏改一处
  - 缺少集中式的「状态变更日志」（何时 / 谁 / 从什么到什么）—— 对结算书这种**归档材料**很关键
- **修复**：
  ```python
  # 方案 A：删 VALID_TRANSITIONS（既然不用）
  # 方案 B（推荐）：setattr hook
  class Item(Base):
      @validates("status")
      def validate_status(self, key, value):
          from app.services.item_service import can_transition
          # 旧值从 session 取（需要先 flush）
          if not can_transition(self.status, value):
              raise ValueError(f"非法状态转换: {self.status} → {value}")
          return value
  ```
- **重要度**：HIGH —— 与 Lane 1 同源，但本 lane 强调「架构层应该有状态机 hook」而非「行级可读性」

---

### 2.2 单一职责违反 — service 既管 DB 又管文件系统又管状态机

- **架构视角**：
  - `file_service.ingest_path()` 一个函数承担：
    1. 判断项目 ID（filesystem path → project_id）
    2. 模糊匹配归属（filename → item）
    3. DB upsert（`db.query(File).filter(...).first()` + update/insert）
    4. 修改 item.status（状态机！）
    5. 创建 _unclaimed 目录（filesystem mkdir）
  - `settlement_builder.build_settlement()` 一个函数承担：
    1. DB 查询（Project / Item / File）
    2. 文件系统读 PDF
    3. PDF 合并 / 目录生成 / 写盘
    4. DB 日志写入（success / failed）
- **架构影响**：
  - 单元测试必须 mock 整个 sqlite + filesystem + pdf reader 三层
  - 业务变更（如 settlement 改为异步）需要改整个函数
  - 单元测试无法隔离测试「状态机逻辑」或「PDF 合并逻辑」
- **修复方向**：
  ```
  file_service.py  →  拆为：
    ├── path_classifier.py   # 路径 → (project_id, item)
    ├── file_writer.py       # DB upsert
    └── state_transition.py  # item.status 转换（用 #2.1 的 hook）
  
  settlement_builder.py → 拆为：
    ├── pdf_merger.py       # 纯函数：(cover, toc, items) → PdfWriter
    └── settlement_runner.py # 业务编排（DB + fs + pdf_merger）
  ```
- **工作量**：~4-5 小时（机械拆分 + 加单元测试 + 调上层调用）
- **重要度**：HIGH —— 不影响当前功能，但⑩ 交付后做 Playwright E2E 时，没有这些拆分会很难 mock

---

### 2.3 路由前缀风格不统一 — `routers/projects.py` 用 prefix，其他用 full path

- **架构视角**：
  - `routers/projects.py`（推测用 `APIRouter(prefix="/api/projects")` —— **未读，但 grep 验证**）
  - `routers/items.py:42` `@router.get("/api/projects/{project_id}/items")` —— 写完整路径，**无 prefix**
  - `routers/settlement.py:13` `router = APIRouter(prefix="/api/projects/{project_id}/settlement", tags=["settlement"])` —— 有 prefix
  - `routers/files.py:12` `router = APIRouter(tags=["files"])` —— 无 prefix，写完整路径
  - `routers/template.py`（推测）—— 未读

  > **验证**：grep `@router.` + `APIRouter(` 各文件，对比 prefix 设置。
- **架构影响**：
  - 路由表分散在 `@router.get("完整路径")` 和 `prefix + @router.get("短路径")` 两种风格
  - 重构路径（如 `/projects/{id}` → `/projects/{uuid}`）需 grep 全文件
  - 前端类型契约（`types/index.ts`）和后端路径不同步时容易漏改
- **修复**：
  - 统一规则：所有 router 用 `prefix="/api/..."`，方法内只写相对路径
  - 加 `tests/test_router_paths.py` 启动时枚举所有路由 + 校验 prefix 一致
- **重要度**：HIGH —— 不阻塞但⑩ 交付前必须清理

---

### 2.4 前后端类型契约 `types/index.ts` ↔ `schemas.py` 手工同步 — 无自动校验

- **架构视角**：
  - `frontend/src/types/index.ts:185` 185 行手工维护的类型
  - `backend/app/schemas.py:159` 159 行 Pydantic schema
  - **两者无任何自动校验**：CI 跑 103 pytest + 61 vitest 都过，但**类型不一致**不会被发现
  - TEST-REPORT §6 表中「状态样式」行 N/A + 「ItemStatus」字段未列 —— 因为根本没自动化校验
- **架构影响**：
  - 类型契约一旦漂移，前端 TypeScript 编译过（因为是本地的）但运行时行为错乱
  - 当前已知偏差：
    - `SettlementJobResponse.error: Optional[str]` vs `SettlementJob.error: string | null` —— 一致 ✓
    - `SettlementJob.file_size: number | null` vs `SettlementJobResponse.file_size: Optional[int]` —— 一致 ✓
    - 但 `SettlementLog.error: Optional[str]` vs `SettlementJob.error` —— 字段名碰巧对，**但 models.py → schemas.py 的转换在 routers/settlement.py:39-47 手写**，drift 风险高
- **修复**（架构级，**长期**）：
  1. 短期：用 `openapi-typescript` 后端 `GET /openapi.json` 自动生成 `types/index.ts`，CI 校验 diff
  2. 中期：考虑用 Pydantic 生成 Zod schema，前端复用 Zod 做运行时校验
  3. 长期：monorepo + 单 schema 源
- **重要度**：HIGH —— 当前类型一致是因为 T-FE-A 手工对齐，但⑨ / ⑩ 加新字段时大概率 drift

---

### 2.5 全局异常 handler 把 `str(exc)` 塞响应 — 安全 / 可观测性双重问题

- **架构视角补充 Lane 1 #MEDIUM-3.4**：
  - `main.py:124-129` 全局 `Exception` handler 把 `str(exc)` 返回前端
  - **可观测性**：没有任何日志记录 → 排查只能靠前端 toast + 用户截图
  - **架构层级错误**：router 业务错误应该由 router 自己抛 `HTTPException`，全局 handler 只兜底**意外**错误（DB 断连 / 编程错误）
  - 当前全局 handler 把业务 ValueError / LookupError 一起兜 → 业务错误响应格式 `{detail, code}` 丢失
- **架构影响**：
  - 错误响应格式不统一：业务错 `{detail: str, code: 'internal_error'}` vs FastAPI 默认 `{detail: str}`
  - 前端 `client.ts:35` `data?.detail ?? error.message` 兜底就是因为后端响应格式漂移
- **修复**：
  ```python
  @app.exception_handler(Exception)
  async def global_exception_handler(request: Request, exc: Exception):
      logger.exception("[UNEXPECTED] %s %s → %s", request.method, request.url.path, exc)
      # 只兜底真正未捕获的异常
      return JSONResponse(
          status_code=500,
          content={"detail": "服务内部错误", "code": "internal_error"},
      )

  # 业务错误应该 raise HTTPException，让 FastAPI 默认 handler 处理
  ```
- **重要度**：HIGH —— 可观测性 + 错误契约统一

---

### 2.6 `access_log_middleware` 同步阻塞 + 无 sample rate — 高 QPS 时阻塞主请求

- **架构视角补充 Lane 1 #HIGH-2.5**：
  - `main.py:104-120` middleware 在每个请求**同步**开 SessionLocal 写 DB
  - 同步阻塞 + SQLite WAL 串行写 = 高 QPS 时（5 用户 × 多端点 × 5s 轮询）整个 FastAPI worker 阻塞
  - **架构影响**：FastAPI 是 async，但 middleware 内部调同步 SQLAlchemy = **async 上下文里跑阻塞 IO**，整个 event loop 卡住
- **修复**（架构级）：
  ```python
  @app.middleware("http")
  async def access_log_middleware(request: Request, call_next):
      response = await call_next(request)
      # 用 BackgroundTasks 在响应后异步写
      if settings.ACCESS_LOG and request.url.path not in ("/api/health", "/favicon.ico"):
          # 把日志丢进 asyncio.Queue + 后台 worker 批量写
          await access_log_queue.put(AccessLog(...))
      return response
  ```
  + 加 `access_log_queue` + 后台 worker（每 100 条 flush 一次 DB）
  + 加 sample rate（默认 10%，可配置）
- **重要度**：HIGH —— 当前 LAN 工具规模 OK，但⑩ 部署到 5+ 用户时会拖慢主流程

---

## 3. 🟡 MEDIUM — ⑨ 推荐修

### 3.1 `pdf_converter.convert_to_pdf()` 用 `subprocess.run` 同步阻塞（即使补全集成也是同步）

- **架构视角**：
  - `pdf_converter.py:52-55` `subprocess.run([wps, "--convert-to", "pdf", ...], timeout=120)`
  - 同步阻塞最长 120s —— 如果在 watcher callback 里调用（DESIGN §4.3 承诺），整个 watchdog observer 线程卡住
- **修复**：
  - 方案 A：`asyncio.create_subprocess_exec` + `await`
  - 方案 B：丢到 `concurrent.futures.ThreadPoolExecutor`，异步等待
- **重要度**：MEDIUM —— 与 Lane 1 #1.2 一同修复时一起改

---

### 3.2 SQLite 写锁 + 多 worker uvicorn 配置不一致

- **架构视角**：
  - `database.py:7-11` SQLite engine + `check_same_thread=False`
  - DESIGN §10.2 生产模式：`uvicorn app.main:app --workers 1`（单 worker，所以 SQLite OK）
  - 但 `config.py` + `start.sh`（未读）若用户改 `--workers 4` 部署，SQLite 写锁会立刻阻塞
- **修复**：
  - `database.py` 加 assert：`if settings.WORKERS > 1 and "sqlite" in settings.DB_PATH: raise RuntimeError("SQLite 不支持多 worker")`
  - 启动时强制校验
- **重要度**：MEDIUM —— LAN 工具默认 1 worker，但⑩ 文档必须警示

---

### 3.3 `safe_join` 路径安全 OK，但 router 层无二次校验

- **架构视角**：
  - `core/paths.py:6-17` `safe_join()` 用 `resolve() + relative_to()` 双重检查，**没有路径穿越漏洞**
  - 但 `routers/settlement.py:89` `p = Path(log.output_path)` —— **直接用 DB 存的路径，不走 safe_join**！
  - 如果 `log.output_path` 被 DB 注入攻击者改为 `/etc/passwd` → FileResponse 读取任意文件
  - 当前 LAN 工具无注入入口（`output_path` 由后端自己写），但**架构上不安全**
- **修复**：
  ```python
  p = safe_join(settings.PROJECTS_DIR, *Path(log.output_path).relative_to(settings.PROJECTS_DIR).parts)
  ```
  + 单元测试补 `test_download_path_traversal_blocked`
- **重要度**：MEDIUM —— 当前安全但架构有缺口

---

### 3.4 业务边界 — DESIGN §2 承诺的「模板加载器」目录结构与实际不符

- **架构视角**：
  - DESIGN §3 目录结构：`core/template_loader.py` + `core/matching.py` + `core/paths.py` —— ✅ 三个文件都在
  - 但 DESIGN §12 风险落实提到的 `core/wps_detector.py` —— **不存在**（见 #1.2）
  - DESIGN §2 架构图提到的 `templates/settlement_cover.py` —— **不存在**（settlement_cover 逻辑直接写在 `settlement_builder.py:29-60` `_draw_cover()`）
- **影响**：DESIGN 与实现漂移 2 处，⑨ 修 #1.2 时一并补
- **重要度**：MEDIUM

---

### 3.5 `print()` 全局风格 — 无 logging 框架

- **架构视角**：
  - 全代码库用 `print(f"[OK] ...", f"[WARN] ...")` 风格
  - 没有 `logging` 模块、没有 `loguru`、没有 `__name__` logger
  - `main.py:31` `print(f"[WATCHER] 处理失败: {path} → {e}")` —— 异常 stack trace 丢失
  - DESIGN §11 测试策略提「监控埋点」—— 但无日志 = 无监控
- **修复**：
  ```python
  # app/logging_config.py
  import logging
  logging.basicConfig(
      level=logging.INFO,
      format="%(asctime)s %(levelname)s %(name)s | %(message)s",
      handlers=[
          logging.StreamHandler(),
          logging.FileHandler(settings.LOG_PATH, encoding="utf-8"),
      ],
  )
  ```
  + 全代码库 `print` → `logger.info/warning/error`
- **重要度**：MEDIUM —— 不阻塞但⑩ 交付后排查困难

---

## 4. 🟢 LOW

### 4.1 `is_in_subfolder` 在 `len(parts) == 2` 时返回 `(project_id, None)` —— 但项目根的 `meta.json` / `_unclaimed/` 等元文件被 file_service 二次判断

- **架构视角**：
  - `paths.py:55-57` 返回 `(project_id, None)` 表示「在项目根目录，不在子文件夹」
  - `file_service.py:26` 单独判断 `meta.json` —— OK
  - 但 `_unclaimed/` 目录下的文件若被 watchdog 触发 → 走模糊匹配 → 项目根匹配失败 → 走 unclaimed 流程 → **unclaimed 路径可能跟刚移走的源文件路径冲突**
- **修复**（建议合并 #1.2）：转码后的 `.pdfs/` 目录在 `is_in_subfolder` 单独标记
- **重要度**：LOW —— 当前 PDF 转码未实现所以不触发，但⑨ 修 #1.2 时需要一起处理

---

### 4.2 `_draw_toc` 在 `y < 2 * cm` 时 `showPage()` 翻页（与 Lane 1 #HIGH-2.3 同源）

- **架构视角**：目录页可能 1-2 页 → DESIGN §4.5 承诺的「先占位目录后回填页码」流程未实现
- 已在 Lane 1 #2.3 报告，本 lane 标记 LOW（与 HIGH 重叠）
- **重要度**：LOW（去重后）

---

## 5. 架构 5 轴评分

| 轴 | 评分 | 说明 |
|----|------|------|
| **Architecture** | ⭐⭐ (2/5) | repositories 层缺失 + service 单一职责违反 + 路由前缀风格不统一；基线债务 |
| **Security（架构级）** | ⭐⭐⭐ (3/5) | safe_join OK + CORS 配置问题（REVIEW 已报）+ global_exception 信息泄漏；但信任边界明确（无鉴权 LAN 工具） |
| **Extensibility** | ⭐⭐ (2/5) | 模版成长机制 OK（item_service.promote_to_template）+ 状态机装饰品；缺 plugins / hooks |
| **Data Flow** | ⭐⭐⭐ (3/5) | watchdog → DB 链路清晰；PDF 转码链路断裂；access_log 同步阻塞；unclaimed item_id="" 字段冗余 |
| **Failure Mode** | ⭐⭐ (2/5) | watchdog 兜底缺失（DESIGN 承诺 APScheduler 未实现）；全局异常 handler 信息泄漏 + 无日志；PDF 生成同步阻塞 LAN 多端 |

**总评**：**架构债务中等偏重**。代码组织 OK（services / routers / core 分层清晰），但 DESIGN 文档与实现有 3 处系统性漂移（repositories / PDF 转码 / APScheduler 兜底），⑨ 必修。

---

## 6. DESIGN 承诺 vs 实际实现对比表

| DESIGN 章节 | 承诺 | 实际 | 状态 |
|------------|------|------|------|
| §2 架构图 Repositories 层 | project_repo / item_repo / file_repo | **不存在** | 🔴 缺失 |
| §3 目录结构 repositories/ | 同上 | **目录不存在** | 🔴 缺失 |
| §3 目录结构 core/wps_detector.py | WPS 探测器 | **不存在** | 🔴 缺失 |
| §4.3 BackgroundTasks 转码 | 异步转 PDF | **convert_to_pdf 0 调用方** | 🔴 缺失 |
| §4.5 BackgroundTask 结算 | 异步生成结算书 | `routers/settlement.py` 接收 `background_tasks` 但**不用** | 🟠 装饰 |
| §5.2 APScheduler 兜底轮询 | watchdog 失败时 5s 轮询 | **未实现**（config 有但 0 引用） | 🔴 缺失 |
| §12 wps_detector.py | 启动时探测 + 提示 | **不存在** | 🔴 缺失 |
| §12 BackgroundTasks 异步 | 大文件转码慢 → 异步 | **未实现** | 🟠 缺失 |
| §2 服务层 services/ | Project / Item / File / Watcher / Pdf / Settlement | ✅ 6 个都在 | ✅ |
| §2 服务层 templates/settlement_cover.py | 独立封面生成器 | 嵌在 settlement_builder.py:_draw_cover | 🟡 位置错 |
| §1.1 依赖 apscheduler | 3.10+ | requirements.txt / pyproject.toml **无 apscheduler** | 🔴 缺失 |
| §11 监控埋点 | 日志 / 监控 | 全 print + 无 logging | 🟡 弱 |

---

## 7. ⑨ 修复优先级建议（架构视角）

| # | 等级 | 简述 | 估计耗时 |
|---|------|------|---------|
| 1 | 🔴 | #1.2 PDF 转码链路补全（detector + BackgroundTask + 状态机） | 2-3h |
| 2 | 🔴 | #1.3 APScheduler 兜底轮询（pip + watcher fallback） | 1h |
| 3 | 🔴 | #1.1 repositories 层创建（机械搬迁 3-4h） | 3-4h |
| 4 | 🟠 | #2.1 VALID_TRANSITIONS hook 或删 | 15min |
| 5 | 🟠 | #2.3 路由 prefix 统一 | 30min |
| 6 | 🟠 | #2.4 前后端类型契约自动校验 | 1h（用 openapi-typescript） |
| 7 | 🟠 | #2.5 全局异常 handler 改造 | 30min |
| 8 | 🟠 | #2.6 access_log 异步 + sample rate | 1h |
| 9 | 🟠 | #2.2 file_service / settlement_builder 单一职责拆分 | 4-5h（可分摊到⑩） |
| 10 | 🟡 | #3.1 pdf_converter async | 30min |
| 11 | 🟡 | #3.2 SQLite 多 worker 启动 assert | 15min |
| 12 | 🟡 | #3.3 download 路径二次校验 | 15min |
| 13 | 🟡 | #3.4 templates/settlement_cover.py 独立 | 10min |
| 14 | 🟡 | #3.5 logging 框架统一 | 30min |
| **合计** | | | **~16h** |

注：架构级修复工作量是行级（Lane 1: ~4.5h）的 3.5x，但都是机械 / 模式化搬迁，可⑨ / ⑩ 分摊。

---

## 8. 完成项

- [x] 16 项架构级发现（3🔴+6🟠+5🟡+2🟢）
- [x] 3 处 DESIGN 承诺未实现的架构缺口（repositories / PDF 转码 / APScheduler）
- [x] DESIGN 承诺 vs 实现对比表（11 行）
- [x] 架构 5 轴评分（综合 2.4/5）
- [x] ⑨ 修复优先级清单（14 项，~16h）
- [x] 与 Lane 1 互补（避免重复，行级细节见 Lane 1）