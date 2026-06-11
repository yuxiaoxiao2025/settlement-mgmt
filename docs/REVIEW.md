# REVIEW — ⑧ 轻量审查报告

> 阶段：⑧ 审查（dev-pipeline-mavis，编排者自审）
> 编排者：Mavis（root session `mvs_46a8dab493d545d2b04e10c9d4339a7b`）
> 日期：2026-06-09
> 范围：28 前端 + 18 后端 + 6 后端测试 + 2 vitest 测试 = 54 源文件
> 方法：浅度阅读（不展开 ⑧.5 双 lane 深度复审），重点是「**生产 bug** + **契约偏离** + **集成死角**」
> 关联：TEST-REPORT §7/§9, CONTEXT-06-integration, CONTEXT-04

---

## 1. 结论速览

| 等级 | 数量 | 建议 |
|------|------|------|
| 🔴 **CRITICAL** | 1 | ⑨ 必修，否则生产流程断 |
| 🟠 **HIGH** | 4 | ⑨ 必修，否则功能/安全有缺口 |
| 🟡 **MEDIUM** | 5 | ⑨ 推荐修，可挂 ⑩ 之后清理 |
| 🟢 **LOW** | 4 | ⑨ 顺手清，不进 DoD |
| ✅ **正向** | 6 | 不动，保持 |

**总评**：代码整体质量**合格**，后端 ⓪.b 阶段 18 文件 + 前端 ⑥ 阶段 28 文件 + ⑦ 阶段 6 文件 + 2 vitest 文件，**架构清晰、契约严格、纯函数 + 单测覆盖好**。但**集成层（App.tsx 路由 + main.py 边缘）有 5 处生产 bug**，必须 ⑨ 修完才能交付。

---

## 2. 🔴 CRITICAL — ⑨ 必修

### 2.1 App.tsx 路由断链：/projects/:id 与 /projects/:id/edit 仍指向 PlaceholderPage

- **文件**：`frontend/src/App.tsx:38-43, 57-58`
- **现象**：路由 `<Route path="/projects/:id" element={<ProjectDetail />} />` 实际指向的 `ProjectDetail` 是 `PlaceholderPage`（占位组件），**真实的 `pages/ProjectDetail.tsx`（331 行）+ `pages/ProjectEdit.tsx`（261 行）存在但未 import**。
- **影响**：用户点项目卡片 → 跳到「项目详情 / 由 T-FE-B 实现」占位页，**核心流程断**。SPEC §11 剧本 1（建项目 → 准备 → 复核 → 生成）走不到第 2 步。
- **修复**：把 import 改成 `import ProjectDetail from '@/pages/ProjectDetail'` + `import ProjectEdit from '@/pages/ProjectEdit'`，删掉 `PlaceholderPage` 与本地 `const ProjectDetail/Edit`。
- **证据**：
  - `pages/ProjectDetail.tsx` 第 28 行 `function ProjectDetail() {...}` 真实存在
  - `pages/ProjectEdit.tsx` 261 行实装
  - 但 `App.tsx:18-22` 只 import 了 4 个页面，**漏了 Detail/Edit**

---

## 3. 🟠 HIGH — ⑨ 必修

### 3.1 settlement_builder.py:163 `buf.seek(1)` — 把字节偏移当页偏移

- **文件**：`backend/app/services/settlement_builder.py:161-163`
- **现象**：
  ```python
  buf = io.BytesIO()
  writer.write(buf)
  buf.seek(1)  # 跳过空白封面（先放真实封面到第 1 页）
  ```
  `BytesIO.seek(1)` 是把**文件指针**移到字节 1（PDF header `%PDF-1.x` 第 1 个字节），**不是「跳过一个空白页」**。注释说「先放真实封面到第 1 页」与代码行为完全不符。
- **影响**：合并阶段把字节错位的「中间 PDF」与真实封面/目录拼接，**输出 PDF 大概率损坏**（pypdf/PDF 阅读器可能报错或显示乱码）。
- **修复**：重新设计合并流程——
  1. 先把所有 primary 写到 `mid_buf`（无空白页）
  2. 画封面 `cover_buf` + 目录 `toc_buf`
  3. `final_writer.append_pages_from_reader(PdfReader(cover_buf))` + `toc_buf` + `mid_buf`
  4. 不要预占空白页再 `seek(1)`
- **测试覆盖**：pytest `test_build_returns_valid_pdf` 只用 `pypdf.PdfReader` 简单解析通过，**没验证页数 / 内容**。需要补页数断言 = 2 + sum(item.pdf_pages)。
- **重要度**：结算书是这个系统的**核心交付物**，损坏 = 项目无法交付。

### 3.2 main.py:138 健康检查字段错位 `wps: bool(_watcher)`

- **文件**：`backend/app/main.py:133-139`
- **现象**：
  ```python
  @app.get("/api/health")
  def health():
      return {
          "status": "ok",
          "watcher": _watcher.is_available if _watcher else False,
          "wps": bool(_watcher),  # 简单占位
      }
  ```
  `wps` 字段读的是 `_watcher`（watchdog 监听器），不是上一步 lifespan 里 `get_wps()` 的结果。
- **影响**：用户访问 `/api/health` 看到的 `wps=true` 永远是 true（只要 watcher 启动），无法反映 WPS CLI 是否真的可用。
- **修复**：把 `wps` 改成 `bool(wps)` 之类（需要把 `wps` 变量存到模块作用域），或者删掉这个字段仅保留 `watcher`。

### 3.3 main.py:96 CORS 混合显式 origins + 通配符 `*`

- **文件**：`backend/app/main.py:94-100`
- **现象**：
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=settings.CORS_ORIGINS + ["*"],
      allow_credentials=True,
      ...
  )
  ```
  CORS spec 规定：若 `allow_credentials=True`，**不允许 `allow_origins=["*"]`**。浏览器会拒绝带 cookie/credentials 的请求。
- **影响**：开发模式下前端在 `http://localhost:5173` 跑时，**所有带 credentials 的请求（CORS 跨域 + axios 携带 cookie）失败**。当前是 LAN 工具所以不一定立刻暴露，但 SPEC.md 若有「登录 / 鉴权」就要修。
- **修复**：要么去掉 `+ ["*"]`，要么 `allow_credentials=False`（LAN 工具通常不要 credentials）。
- **当前 SPEC 状态**：本系统 SPEC §13 明确「LAN 工具，无鉴权」，所以这一条**降级为 🟡 MEDIUM**——保留 + `["*"]` 的写法并不阻塞当前功能。但若将来加 cookie / 鉴权，会立刻踩坑。

### 3.4 main.py:124-129 全局异常处理器把原始异常塞进响应

- **文件**：`backend/app/main.py:124-129`
- **现象**：
  ```python
  @app.exception_handler(Exception)
  async def global_exception_handler(request: Request, exc: Exception):
      return JSONResponse(
          status_code=500,
          content={"detail": str(exc), "code": "internal_error"},
      )
  ```
  把 `str(exc)` 原样返回给前端。SQLAlchemy / pypdf / watchdog 抛的异常往往带**文件绝对路径、SQL 语句、堆栈内部信息**。
- **影响**：局域网内部工具，影响有限；不暴露外网就 OK。
- **修复**：
  - 记录异常到日志（`logger.exception(...)`）
  - 响应只返回 `{"detail": "服务内部错误", "code": "internal_error"}`
  - 开发模式下可加 `if settings.DEBUG: detail = str(exc)`
- **当前 SPEC 状态**：LAN 工具，影响小。**降级为 🟡 MEDIUM**——但建议 ⑨ 修。

---

## 4. 🟡 MEDIUM — ⑨ 推荐修

### 4.1 3700 条 pydantic v2 + datetime.utcnow() 弃用警告

- **文件**：TEST-REPORT §3 已记录，影响整个后端。
- **修复**：
  - `datetime.utcnow()` → `datetime.now(timezone.utc)`（或保留 naive + 加 `# noqa: DTZ005`）
  - pydantic v2 class-based config → `model_config = ConfigDict(...)`（pydantic-settings 已用新写法）
- **工作量**：~30 处，机械替换，1-2 小时。

### 4.2 vite.config.d.ts 是 Vite 自动生成的残留

- **文件**：`frontend/vite.config.d.ts`（2 行，git 跟踪）
- **现象**：Vite 在第一次 build 时会生成 `vite.config.d.ts`。当前是 `frontend/vite.config.d.ts`（2 行）+ `frontend/vite.config.ts`（31 行）+ `frontend/vite.config.js`（30 行）三个并存。
- **影响**：`vite.config.js` 不该存在（TypeScript 项目用 .ts）；`vite.config.d.ts` 与 .ts 重复。
- **修复**：删 `vite.config.js` + `vite.config.d.ts`，让 Vite 在下次 build 重新生成。

### 4.3 item_service.py:90 confirm 选 primary 的单行表达式可读性差

- **文件**：`backend/app/services/item_service.py:90`
  ```python
  for f in item.files: f.is_primary = (f in (pdf_files or item.files)[:1])
  ```
- **修复**：
  ```python
  primary_set = set((pdf_files or item.files)[:1])
  for f in item.files:
      f.is_primary = (f in primary_set)
  ```
  或更显式：
  ```python
  if pdf_files:
      primary = pdf_files[0]
  elif item.files:
      primary = item.files[0]
  else:
      primary = None
  for f in item.files:
      f.is_primary = (f is primary)
  ```

### 4.4 item_service.py:128-142 promote_to_template 内存 ↔ 磁盘状态分裂

- **文件**：`backend/app/services/item_service.py:121-143`
- **现象**：
  ```python
  template_items = get_or_load_template_items()  # 读内存缓存
  ...
  with open(settings.TEMPLATE_PATH, "r", encoding="utf-8") as f:
      data = json.load(f)  # 重新读磁盘
  data["items"] = template_items  # 用内存版覆盖磁盘版
  ```
  若两次调用之间有别人改了磁盘上的 `master_template.json`，本函数的内存版会**覆盖**新内容（写丢失）。
- **修复**：以磁盘为唯一源——先 `json.load` 磁盘，append，dump 回磁盘，再 `get_or_load_template_items()` 重置内存缓存。
- **影响面**：低（仅在「推广扩展项到模版」时触发，且 LAN 单进程）；列为 MEDIUM。

### 4.5 main.py:96 CORS 问题重述

- 见 §3.3，已说明降级为 MEDIUM 的理由。

---

## 5. 🟢 LOW — ⑨ 顺手清

| # | 位置 | 现象 | 修复 |
|---|------|------|------|
| 5.1 | `store/app.ts:62-66` | UUID 兜底用 `Math.random().toString(36)` 弱随机 | 接受（仅 toast id，撞不上） |
| 5.2 | `lib/status.ts:88` | `archived` icon 用 📦 emoji，部分字体不渲染 | 改成 SVG 或 🗄️ |
| 5.3 | `routers/files.py:46-50` | `refresh_item` 的 `added` 计数会重复计入同一文件多次 | 加 `set` 去重 |
| 5.4 | `.opencode/tmp/pytest-of-yqh/...` | 测试临时目录被 git 跟踪 | 加 `.gitignore` 排除 `.opencode/tmp/`、`backend/.pytest_cache/` |

---

## 6. ✅ 正向发现（保持）

1. **lib/format.ts + lib/status.ts 是范本级代码**：纯函数 + 类型 + 契约 + 61 vitest 用例覆盖所有边界（含 `formatFileSize(-1)`、`formatDeadline(0)`、4 个 ItemStatus × 4 字段 等）。T-FE-C 的 StatusBadge 与本契约在 status.test.ts 锁死。
2. **master_template.json 含 25 项标准资料**，与 SPEC §3.1 / 项目交接清单 docx 一致。
3. **后端状态机**（item_service.py:14-19 `VALID_TRANSITIONS`）**显式枚举**，与 test_items.py 5+ 状态机用例双向验证。
4. **路径安全**（core/paths.py `safe_join`）用 `resolve() + relative_to()` 双重检查，**没有路径穿越漏洞**。
5. **API 类型契约**（types/index.ts 185 行）覆盖 Project / Item / File / SettlementJob / ApiError，**前后端共享**。
6. **TEST-REPORT.md 本身是优秀文档**：9 章节 + 复现命令 + 已知缺口列入 §9，是 ⑧.5 / ⑩ 复用的好材料。

---

## 7. ⑨ 修复候选清单（移交 ⑨ 阶段）

按优先级排序（来自 §2-§5）：

| # | 等级 | 文件 | 行 | 修复内容 | 估计耗时 |
|---|------|------|----|---------|---------|
| 1 | 🔴 | frontend/src/App.tsx | 17-22, 38-43 | import 真实 ProjectDetail/Edit，删 PlaceholderPage | 5 min |
| 2 | 🟠 | backend/app/services/settlement_builder.py | 128-184 | 重写合并流程：直接 append cover+toc+mid，删 `buf.seek(1)` 与预占空白页 | 30 min |
| 3 | 🟠 | backend/tests/test_settlement.py | (新增) | 加 `test_build_pdf_page_count_correct` 验证 2+sum(pages) | 10 min |
| 4 | 🟠 | backend/app/main.py | 133-139 | 修 `wps: bool(wps)` 字段 | 2 min |
| 5 | 🟡 | backend/app/main.py | 124-129 | 全局异常 handler 改 logger + 通用文案 | 5 min |
| 6 | 🟡 | backend/app/main.py | 94-100 | CORS 去掉 `+ ["*"]` 或 `allow_credentials=False` | 2 min |
| 7 | 🟡 | 全 backend | grep | `datetime.utcnow()` → `datetime.now(timezone.utc)` | 60 min（30 处） |
| 8 | 🟡 | frontend/ | 删 | 删 vite.config.js + vite.config.d.ts | 1 min |
| 9 | 🟡 | backend/app/services/item_service.py | 90 | 改写 confirm primary 选择逻辑 | 5 min |
| 10 | 🟡 | backend/app/services/item_service.py | 121-143 | 修 promote_to_template 内存 ↔ 磁盘同步 | 10 min |
| 11 | 🟢 | .gitignore | 新增 | 加 `.opencode/tmp/` + `**/.pytest_cache/` | 1 min |
| **合计** | | | | | **~2.2 小时** |

---

## 8. ⑨ 修复后回归计划

- 修完 #1 后必须 npm run dev 打开 /projects/<id> 看到真实详情页（**最关键的手动回归**）
- 修完 #2 后必须跑 pytest 看到 103/103 + 加新的页数断言
- 修完 #4/5/6 后必须 curl /api/health 看 JSON 字段正确
- 修完 #7 后必须 pytest -W error::DeprecationWarning 跑过（确认 3700 warnings → 0）
- 修完 #11 后 `git status` 不再列 .opencode/tmp/ 与 .pytest_cache/

---

## 9. 不在本阶段覆盖（移交 ⑩ / ⑪）

- React 组件单测（StatusBadge / ItemRow / FileList）—— TEST-REPORT §7 列为「⑨/⑩ 之间补」
- Playwright E2E 4 剧本 —— ⑩ 交付前补
- 真实 LAN 多端并发负载 —— ⑩ 交付后由用户验收

---

## 10. 完成项

- [x] 54 源文件浅度审查完成
- [x] 1 CRITICAL + 4 HIGH + 5 MEDIUM + 4 LOW 已识别
- [x] ⑨ 修复候选清单 11 项已列，估时 ~2.2 小时
- [x] ⑨ 修复后回归计划已列
- [x] ⑧.5 深度复审的输入材料已就绪（REVIEW.md 本文件 + TEST-REPORT.md + CONTEXT-06-integration.md）
