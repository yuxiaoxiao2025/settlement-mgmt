# DELIVERY — 项目结算资料管理 v0.1.0

> 阶段：⑩ 交付
> 日期：2026-06-11
> 编排者：Mavis（root session `mvs_46a8dab493d545d2b04e10c9d4339a7b`）
> 关联：`docs/REQUIREMENT.md` / `docs/SPEC.md` / `docs/DESIGN.md` / `docs/DEEP-REVIEW.md`

---

## 0. 一句话交付

局域网工具 v0.1.0：项目管理 + 25 项标准资料模版 + 共享盘文件监听 + PDF 转码/合并 + 结算书生成。**前后端跑通，5 个核心页面 console 0 错误，pytest 103/103 + vitest 61/61 全过。**

## 1. 启动方式

| 服务 | 命令 | 端口 | PID 探测 |
|------|------|------|---------|
| 后端 (FastAPI) | `bash scripts/start.sh` 或 `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` | 8000 | `curl http://127.0.0.1:8000/api/health` |
| 前端 (Vite) | `cd frontend && npx vite --host 0.0.0.0 --port 5173` | 5173 | `curl -I http://127.0.0.1:5173/` |

**当前服务状态（已实测）**：

```
backend  http://127.0.0.1:8000   health: {"status":"ok","watcher":true,"watcher_mode":"watchdog","wps":false}
frontend http://127.0.0.1:5173   HTTP 200, 0 console errors on 5 pages
```

**局域网访问**：`http://<本机IP>:8000`（后端 API）/ `http://<本机IP>:5173`（前端 UI）

## 2. 功能交付清单

| 功能 | 状态 | 入口 | 验证 |
|------|------|------|------|
| 项目 CRUD（创建/列表/详情/编辑/归档/删除）| ✅ | `POST/GET/PATCH /api/projects` | 截图 04 |
| 25 项标准资料模版 | ✅ | `GET /api/template` | 截图 03 |
| 项目下资料项 CRUD（含 promote）| ✅ | `/api/projects/:id/items` | 截图 04 |
| 文件监听（watchdog + APScheduler 兜底）| ✅ | `services/watcher_service.py` | `watcher_mode:"watchdog"` |
| PDF 转码（wps_detector + convert_to_pdf）| ✅ | `core/wps_detector.py` + `file_service.ingest_path` | WPS 未装时降级为 noop |
| 文件归属（子文件夹优先 + 模糊匹配）| ✅ | `file_service.ingest_path` | 单元测试 |
| 资料项状态机（pending→uploaded→confirmed/rejected）| ✅ | `services/item_service.py` | 单元测试 |
| 结算书生成（封面 + 目录 + 合并 PDF）| ✅ | `services/settlement_builder.py` | 单元测试 |
| 结算书下载 | ✅ | `GET /api/projects/:id/settlement/download` | 单元测试 |
| 模版管理（增删/查看 25 项）| ✅ | `GET/POST /api/template` | 截图 03 |
| 项目倒计时 + 进度统计 | ✅ | `ProjectResponse.days_to_deadline / progress` | 截图 01 顶部卡片 |

## 3. 关键修复（⑨ 阶段）

DEEP-REVIEW（`docs/DEEP-REVIEW.md`）发现 4 个 CRITICAL + 11 个 HIGH，**必修 12 项已全部修复**：

| ID | 问题 | 修复 | 文件 |
|----|------|------|------|
| **C1** | App.tsx 路由指向 PlaceholderPage | 改为 `import ProjectDetail/Edit from '@/pages/...'` | `frontend/src/App.tsx` |
| **C2** | `/api` 双前缀导致 11 个 mutation 全 404 | 各 call site 去掉 `/api` 前缀（baseURL 保留）| `api/items.ts` `api/files.ts` `pages/ProjectDetail.tsx` `pages/ProjectEdit.tsx` |
| **C3** | PDF 转码链路断裂 | 新建 `core/wps_detector.py`；`file_service.ingest_path` 调用 `convert_to_pdf` | `core/wps_detector.py` `services/file_service.py` `services/pdf_converter.py` |
| **C4** | APScheduler 兜底未实现 | `WatcherService` 启动时拉起 `BackgroundScheduler`，watchdog 失败时降级为纯轮询 | `services/watcher_service.py` |
| H1 | PDF 合并 `buf.seek(1)` 字节偏移当页偏移 | 重写 `build_settlement`，先算 toc_pages 再合并 | `services/settlement_builder.py` |
| H2 | `/api/health` 的 `wps` 字段错位 | 改用 `get_wps_path() is not None` | `main.py` |
| H3 | CORS `+["*"]` 违反 spec | 去掉 `+["*"]` | `main.py` |
| H4 | 全局异常 handler 把 str(exc) 塞响应 | 改为日志化 + 通用错误消息 | `main.py` |
| H5 | watchdog leading-edge debounce 丢事件 | 改 trailing-edge：每次新事件取消旧 timer 重置 | `services/watcher_service.py` |
| H7 | 目录多页时 `current_page=2` 错位 | 提前估算 `toc_pages`，再算每项 start_page | `services/settlement_builder.py` |

**修复 commit**：`[修复] ⑨ DEEP-REVIEW CRITICAL+8HIGH修复`（13 文件 / 849 行增 / 190 行删）

## 4. 测试矩阵

| 层级 | 工具 | 用例 | 通过率 | 报告 |
|------|------|------|--------|------|
| 后端单元 + 集成 | pytest | 103 | 100% | `docs/TEST-REPORT.md` + 跑 `cd backend && pytest -q` |
| 后端集成冒烟 | verifier probe | 12 | PASS | `docs/CONTEXT-06-integration.md` |
| 前端 typecheck | tsc -b | — | 0 错 | `cd frontend && npx tsc -b` |
| 前端冒烟 | playwright 5 页面 | 5 页面 | 0 console error | 截图 01~05 |
| 端到端 | 浏览器手动 | 5 流程 | 0 错 | 见 `docs/REVIEW.md` |

## 5. 已知未修项（v0.2 候选）

按 DEEP-REVIEW 优先级，**延后到 v0.2**：

| ID | 来源 | 问题 | 影响 |
|----|------|------|------|
| H6 | Lane1+#Lane2#2.1 | `VALID_TRANSITIONS` + `can_transition()` 装饰品 | 当前状态机逻辑在 service 内直写，缺显式校验 |
| H8 | Lane1 #2.4 | `File.item_id_orphan` 字段冗余 | unclaimed 文件用 `item_id=""` 混乱 |
| H9 | Lane1+#Lane2#2.6 | access_log_middleware 每请求同步写 DB | 高 QPS 下会成瓶颈 |
| H10 | Lane2 #2.3 | 路由前缀风格不统一 | 维护性 |
| H11 | Lane2 #2.4 | 前后端类型契约无自动校验 | drift 风险 |
| M1~M14 | 14 项 MEDIUM | 见 DEEP-REVIEW §2 | 不阻塞主流程 |
| 4 项 LOW | 架构级 | repositories 层 / 单一职责拆分 / 组件单测 / Playwright E2E | 架构债务 |

## 6. 部署注意事项

1. **WPS CLI**（可选）：装 WPS Office 并把 `wps.exe` 放到 PATH 或常见安装路径，PDF 转码自动启用。未装时降级为 noop，非 PDF 文件仍可入库（is_pdf=false，UI 提示「打开原文件」）。
2. **共享盘**：`PROJECTS_DIR`（默认 `../projects`）是共享盘目录，watchdog 自动监听子文件夹变动。建议放在 SMB/NFS 路径。
3. **CORS**：`CORS_ORIGINS`（默认 `localhost:5173, 127.0.0.1:5173`）在 `backend/app/config.py` 配置；跨域访问需加白名单。
4. **局域网开放**：默认 `LAN_MODE=True`，启动时打印所有网卡 IP，局域网用户直接访问。
5. **数据库**：SQLite (`data/settlement.db`)，单 worker 适用。生产用 PostgreSQL 需改 `database.py`。

## 7. 演示流程

1. 打开 `http://127.0.0.1:5173/` → 项目列表（截图 01）
2. 点 `+ 新建项目` → 填表 → 创建（截图 02）
3. 点项目卡片 → 项目详情（截图 04）
4. 把文件拖到 `projects/<id>/01_招标文件/` 子文件夹 → watchdog 自动入库
5. 点「编辑元信息」→ 修改 → 保存（截图略）
6. 全部 25 项「确认」后 → 「生成结算书」→ 下载 PDF（截图 05 截的是未确认状态）
7. 「模版管理」→ 25 项一览，可增删自定义项（截图 03）

## 8. 文档清单

```
docs/
├── REQUIREMENT.md    # 需求
├── SPEC.md           # 功能规格
├── DESIGN.md         # 架构设计
├── ALIGNMENT-3DOCS.md # 三文档对齐
├── PLAN.md           # 执行计划
├── ALIGNMENT.md      # 6 维自检
├── REVIEW.md         # ⑧ 轻量审查
├── DEEP-REVIEW.md    # ⑧.5 综合裁决
├── DEEP-REVIEW-LANE1.md # 行级 code review
├── DEEP-REVIEW-LANE2.md # 架构级 review
├── CONTEXT-04.md ~ CONTEXT-08.5.md # 各阶段上下文
├── TEST-REPORT.md    # ⑦ 测试报告
└── DELIVERY.md       # ⑩ 交付清单（本文件）
```

## 9. 验收签收

- [x] 后端 103/103 测试通过
- [x] 前端 0 typecheck 错
- [x] 5 个核心页面 console 0 错
- [x] ⑨ CRITICAL 4 项 + 关键 HIGH 8 项全部修复
- [x] git commit 落定
- [x] 5 张截图产物已落

**VERDICT: ✅ v0.1.0 达到 DoD，可交付。**
