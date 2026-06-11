# DEEP-REVIEW — ⑧.5 深度复审综合裁决

> 阶段：⑧.5 深度复审（双 lane 综合）
> 执行者：Mavis（root session `mvs_46a8dab493d545d2b04e10c9d4339a7b`，现场接手 — 双 lane plan 被引擎自动 cancel，由 root 单 session 完成双 lane 综合）
> 日期：2026-06-09 22:24 (Asia/Shanghai)
> 输入：`docs/DEEP-REVIEW-LANE1.md`（行级 16 项）+ `docs/DEEP-REVIEW-LANE2.md`（架构级 16 项）+ `docs/REVIEW.md`（⑧ 轻量 14 项）+ `docs/TEST-REPORT.md` + `docs/CONTEXT-06-integration.md`
> 方法：合并去重 + 取两 lane 更高严重度 + 与 REVIEW.md 跨轮合并
> 关联：DEEP-REVIEW-LANE1.md / DEEP-REVIEW-LANE2.md / CONTEXT-08.5.md

---

## 0. 决策摘要

| 裁决项 | 结果 |
|--------|------|
| **最终裁决** | 🟠 **REQUEST CHANGES** |
| **原因** | 🔴 CRITICAL 数量 4（>0 触发 REQUEST CHANGES）+ 🟠 HIGH 数量 11（>2 触发 REQUEST CHANGES）|
| **⑨ 阶段必修（CRITICAL + 关键 HIGH）** | **14 项 / 估时 ~12h** |
| **⑩ 阶段延后** | 14 项延后（架构级债务 + LOW）|
| **⑨ 后能否交付** | ✅ 可以（核心 CRITICAL + 关键 HIGH 修完即可满足 DoD） |

---

## 1. 三轮合并统计

| 来源 | CRITICAL | HIGH | MEDIUM | LOW | 合计 |
|------|----------|------|--------|-----|------|
| REVIEW.md（⑧ 轻量） | 1 | 4 | 5 | 4 | 14 |
| DEEP-REVIEW-LANE1（⑧.5 行级） | **2** | 5 | 6 | 3 | 16 |
| DEEP-REVIEW-LANE2（⑧.5 架构） | **3** | 6 | 5 | 2 | 16 |
| **去重后总计** | **4** | **11** | **14** | **8** | **37** |

去重规则：
- 同一文件同一行的同源问题合并（如 main.py:138 wps 字段 → REVIEW + Lane 1 都有，取 HIGH）
- 同一根因的问题归一（如 PDF 转码缺失 + convert_to_pdf 无调用方 → 1 个 CRITICAL）
- 行级细节以 Lane 1 为准，架构级视角以 Lane 2 为准

---

## 2. 最终问题清单（按严重度排序）

### 🔴 CRITICAL（4 项）— ⑨ 必修

| # | 来源 | 文件 | 问题 | 估时 |
|---|------|------|------|------|
| C1 | REVIEW §2.1 | `frontend/src/App.tsx:38-43, 57-58` | 路由断链：`/projects/:id` 与 `/projects/:id/edit` 仍指向 PlaceholderPage | 5 min |
| **C2** | **Lane 1 #1.1** | **`frontend/src/api/items.ts` 7 处 + `files.ts` 4 处** | **`/api` 双前缀导致 11 个 mutation 全部 404**（confirm / reject / reset / add / update / delete / list + listFiles / refresh / delete / setPrimary）| **15 min** |
| **C3** | **Lane 1 #1.2 + Lane 2 #1.2** | **`pdf_converter.convert_to_pdf()` 0 调用方 + `core/wps_detector.py` 不存在** | **PDF 转码链路完全断裂（DESIGN §4.3/§12 承诺 vs 实现差距）** | **60 min** |
| **C4** | **Lane 2 #1.3** | **`config.py:27 WATCHDOG_FALLBACK_POLL` + `requirements.txt` 无 apscheduler** | **watchdog 失败时 APScheduler 兜底轮询完全未实现（DESIGN §5.2 承诺）** | **60 min** |

### 🟠 HIGH（11 项）— ⑨ 必修

| # | 来源 | 文件 | 问题 | 估时 |
|---|------|------|------|------|
| H1 | REVIEW §3.1 | `services/settlement_builder.py:161-163` | PDF 合并 `buf.seek(1)` 把字节偏移当页偏移 | 30 min |
| H2 | REVIEW §3.2 | `main.py:138` | 健康检查 `wps: bool(_watcher)` 字段错位 | 2 min |
| H3 | REVIEW §3.3 | `main.py:94-100` | CORS `+ ["*"]` + `allow_credentials=True` 违反 spec | 2 min |
| H4 | REVIEW §3.4 | `main.py:124-129` | 全局异常 handler 把 str(exc) 塞响应（无日志） | 5 min |
| **H5** | **Lane 1 #2.1** | **`watcher_service.py:18-31`** | **debounce 是 leading-edge，编辑器保存会被截断** | **20 min** |
| **H6** | **Lane 1 #2.2 + Lane 2 #2.1** | **`item_service.py:14-23`** | **`VALID_TRANSITIONS` + `can_transition()` 装饰品（0 调用方）** | **15 min** |
| **H7** | **Lane 1 #2.3 + Lane 2 #4.2** | **`settlement_builder.py:132 + _draw_toc 翻页** | **目录页多页时 `current_page=2` 假设错位** | **30 min** |
| **H8** | **Lane 1 #2.4** | **`models.py:69 + file_service.py:73 + routers/items.py:45`** | **`File.item_id_orphan` 字段冗余，unclaimed 用 `item_id=""` 混乱** | **15 min** |
| **H9** | **Lane 1 #2.5 + Lane 2 #2.6** | **`main.py:104-120`** | **access_log_middleware 每请求同步写 DB，无 sample rate** | **15 min** |
| **H10** | **Lane 2 #2.3** | **所有 router 文件** | **路由前缀风格不统一（projects 用 prefix，其他用 full path）** | **30 min** |
| **H11** | **Lane 2 #2.4** | **`types/index.ts` ↔ `schemas.py`** | **前后端类型契约无自动校验，手工同步 drift 风险** | **1h（用 openapi-typescript）** |

### 🟡 MEDIUM（14 项）— ⑨ 推荐修

| # | 来源 | 文件 | 问题 | 估时 |
|---|------|------|------|------|
| M1 | REVIEW §4.1 + Lane 1 #3.1 | 全 backend（11 处） | `datetime.utcnow()` pydantic v2 弃用警告 | 60 min |
| M2 | REVIEW §4.2 | `frontend/vite.config.js + .d.ts` | Vite 配置残留文件 | 1 min |
| M3 | REVIEW §4.3 + Lane 1 #3.5 | `services/item_service.py:90` | confirm primary 单行表达式可读性差 | 5 min |
| M4 | REVIEW §4.4 | `services/item_service.py:121-143` | promote_to_template 内存↔磁盘分裂 | 10 min |
| M5 | REVIEW §4.5 | `main.py:94-100` | CORS 复用 H3（已记录） | 0 min |
| **M6** | **Lane 1 #3.6** | **`schemas.py:58-59, 84-85, 100-101`** | **`class Config` 旧 pydantic v1 写法** | **5 min** |
| **M7** | **Lane 2 #3.1** | **`pdf_converter.py:52-55`** | **`subprocess.run` 同步阻塞最长 120s** | **30 min** |
| **M8** | **Lane 2 #3.2** | **`database.py` 启动 assert** | **SQLite 多 worker 配置不一致风险** | **15 min** |
| **M9** | **Lane 2 #3.3** | **`routers/settlement.py:89`** | **下载路径不走 safe_join，DB 注入风险** | **15 min** |
| **M10** | **Lane 2 #3.4** | **`templates/settlement_cover.py`** | **DESIGN §2 承诺的封面生成器未独立文件** | **10 min** |
| **M11** | **Lane 2 #3.5** | **全 backend** | **`print()` 全局风格，无 logging 框架** | **30 min** |
| M12 | REVIEW §3.3 重述 | （同 H3） | 同上 | 0 min |
| M13 | REVIEW §3.4 重述 | （同 H4） | 同上 | 0 min |
| M14 | Lane 1 #3.3 | `pdf_converter.py:57, 64, 67` | 错误信息截断不友好 + print 而非 logging | 10 min |

### 🟢 LOW（8 项）— ⑨ 顺手清

| # | 来源 | 文件 | 问题 | 估时 |
|---|------|------|------|------|
| L1 | REVIEW §5.1 | `store/app.ts:62-66` | UUID 兜底 Math.random 弱随机（接受） | 0 |
| L2 | REVIEW §5.2 | `lib/status.ts:88` | archived icon 用 📦 emoji | 1 min |
| L3 | REVIEW §5.3 + Lane 1 #4.3 | `routers/files.py:46-50` | `refresh_item` `added` 重复 + 返回值语义错 | 10 min |
| L4 | REVIEW §5.4 | `.gitignore` | 加 `.opencode/tmp/` + `**/.pytest_cache/` | 1 min |
| **L5** | **Lane 2 #4.1** | **`paths.py` + `file_service.py`** | **`.pdfs/` 转码目录走模糊匹配（与 #C3 同修）** | **0** |
| **L6** | **Lane 2 #4.2** | **`settlement_builder.py:_draw_toc`** | **（与 #H7 同修）** | **0** |
| **L7** | **Lane 1 #3.4 重述** | **`main.py:124-129`** | **（与 #H4 同修）** | **0** |
| **L8** | **Lane 1 #3.5 重述** | **`item_service.py:90`** | **（与 #M3 同修）** | **0** |

---

## 3. ⑨ 阶段修复计划（去重后）

### 3.1 必修清单（CRITICAL + 关键 HIGH，共 12 项 / ~7h）

按修复顺序排列：

| 顺序 | # | 等级 | 文件 | 修复内容 | 估时 |
|------|---|------|------|----------|------|
| 1 | C1 | 🔴 | `App.tsx:17-22, 38-43` | import 真实 ProjectDetail/Edit，删 PlaceholderPage | 5 min |
| 2 | C2 | 🔴 | `api/items.ts` 7 处 + `api/files.ts` 4 处 | 删 `/api` 前缀（与 projects.ts / template.ts / settlement.ts 一致） | 15 min |
| 3 | H2 | 🟠 | `main.py:133-139` | `wps: bool(wps)` 字段修 | 2 min |
| 4 | H3 | 🟠 | `main.py:94-100` | CORS 去掉 `+ ["*"]` 或 `allow_credentials=False` | 2 min |
| 5 | H1 + H7 | 🟠 | `services/settlement_builder.py:128-184` | 重写合并流程 + 目录页码算法 | 60 min |
| 6 | H8 | 🟠 | `models.py` + `file_service.py` + `routers/items.py` | `File.item_id_orphan` 字段归一化 | 15 min |
| 7 | H6 | 🟠 | `services/item_service.py:14-23` | 删或重构 VALID_TRANSITIONS | 15 min |
| 8 | H5 | 🟠 | `services/watcher_service.py:18-31` | leading-edge → trailing-edge | 20 min |
| 9 | C4 | 🔴 | `config.py` + `watcher_service.py` + `requirements.txt` | APScheduler 兜底轮询 | 60 min |
| 10 | C3 | 🔴 | `core/wps_detector.py` + `services/pdf_converter.py` + `services/file_service.py` | PDF 转码链路补全 | 60 min |
| 11 | H9 | 🟠 | `main.py:104-120` | access_log sample rate 或异步 | 15 min |
| 12 | H4 | 🟠 | `main.py:124-129` | 全局异常 handler 改 logger + 通用文案 | 5 min |
| **必修小计** | | | | | **~4h** |

### 3.2 推荐修（其余 HIGH + MEDIUM，共 13 项 / ~3h）

| 顺序 | # | 等级 | 简述 | 估时 |
|------|---|------|------|------|
| 13 | H10 | 🟠 | 路由 prefix 统一 | 30 min |
| 14 | H11 | 🟠 | openapi-typescript 自动校验 | 1h |
| 15 | M1 | 🟡 | datetime.utcnow 11 处机械替换 | 60 min |
| 16 | M2 | 🟡 | 删 vite.config.js + .d.ts | 1 min |
| 17 | M3 | 🟡 | confirm primary 可读性 | 5 min |
| 18 | M4 | 🟡 | promote_to_template 内存↔磁盘 | 10 min |
| 19 | M6 | 🟡 | schemas ConfigDict | 5 min |
| 20 | M7 | 🟡 | pdf_converter async | 30 min |
| 21 | M8 | 🟡 | SQLite 多 worker assert | 15 min |
| 22 | M9 | 🟡 | download 路径 safe_join 二次校验 | 15 min |
| 23 | M10 | 🟡 | settlement_cover.py 独立文件 | 10 min |
| 24 | M11 | 🟡 | logging 框架统一 | 30 min |
| 25 | M14 + L2-L4 | 🟡+🟢 | 其余 LOW | 12 min |
| **推荐小计** | | | | | **~5h** |

### 3.3 ⑨ 阶段总工作量

- **必修 4h + 推荐 5h = ~9h**
- 加 ⑦ 测试覆盖盲区补齐（Lane 1 §6 提的 7 项 + Lane 2 提的 5 项 = 12 项测试），估时 +1-2h
- **⑨ 阶段总工作量：~10-11h**（人工 4 个 worker 并行可压缩到 ~3h 实际墙钟）

---

## 4. ⑨ 修复后回归验证清单（关键）

| # | 修后必跑 | 期望 |
|---|----------|------|
| 1 | C1 | `npm run dev` + 浏览器打开 `/projects/<uuid>` 看到真实详情页（**最关键手动回归**） |
| 2 | C2 | `curl -X POST http://localhost:8000/api/items/{id}/confirm -d '{}'` → 200/409 而非 404 |
| 3 | C2 + useItems 链 | 浏览器 ProjectDetail 页面：点「确认」按钮 → 看到 item 变绿色 confirmed 状态 |
| 4 | C3 | 拖 .docx 到子文件夹 → 5s 内看到 PDF 文件 + is_pdf=true |
| 5 | C4 | 启动时强制 kill watchdog → 看日志确认「启动兜底轮询」 + 拖文件 → 仍能入库 |
| 6 | H1 + H7 | `pytest` 跑过 + 新加 `test_build_pdf_page_count_correct` 断言 `2 + sum(item.pdf_pages)` |
| 7 | H2 | `curl /api/health` → JSON 字段 `wps` 反映真实探测结果 |
| 8 | H3 | `curl -H "Origin: http://localhost:5173" /api/health` 200 而非 403 |
| 9 | H5 | 模拟 5 次 modified → 期望只入库 1 次 + filesize=最终大小 |
| 10 | H8 | `curl /api/projects/{id}/items` → `unclaimed[].item_id` 为 NULL 而非 "" |
| 11 | H9 | `pytest` 不变 + `/api/health` 5s 内 100 次 → access_log 表行数 ≤ 10 |
| 12 | 全部 | `pytest` 103 → 110+（含新增 PDF 转码 / 路径安全 / access_log 测试） + `vitest` 61 → 65+ |

---

## 5. ⑩ 延后清单（架构债务 / 不阻塞 DoD）

| 项 | 来源 | 说明 |
|----|------|------|
| Lane 2 #1.1 repositories 层 | Lane 2 CRITICAL | 架构基线级缺口，⑨ / ⑩ 分摊搬迁（3-4h） |
| Lane 2 #2.2 单一职责拆分 | Lane 2 HIGH | file_service / settlement_builder 拆分（4-5h） |
| React 组件单测 | TEST-REPORT §9 | StatusBadge / ItemRow / FileList 组件交互（4-5h） |
| Playwright E2E 4 剧本 | TEST-REPORT §9 | 真实浏览器路径（4-6h） |

---

## 6. 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **代码质量（行级）** | ⭐⭐⭐⭐ (4/5) | 命名清晰 + 类型契约 + 边界处理 OK；少数可读性问题 |
| **架构合理性** | ⭐⭐ (2.4/5) | DESIGN 3 处承诺未实现 + service 单职违反 + 路由风格不统一 |
| **测试覆盖** | ⭐⭐⭐ (3.5/5) | 后端 103 + 前端 61 + 集成冒烟 12 项；但 PDF 转码 / mutation 链 / 组件交互未覆盖 |
| **可观测性** | ⭐⭐ (2/5) | 全 print + 无 logging + access_log 同步阻塞 |
| **安全（LAN 工具）** | ⭐⭐⭐ (3.5/5) | safe_join OK + 无鉴权 + CORS 配置问题 + global_exception 信息泄漏 |
| **总体** | **⭐⭐⭐ (3/5)** | **合格有差距**：核心业务流程可跑，⑨ 修 4 项 CRITICAL + 8 项关键 HIGH 后达到 4/5 交付标准 |

---

## 7. 最终裁决

> 🟠 **REQUEST CHANGES** —— 但 **⑨ 修完 4 项 CRITICAL + 8 项 HIGH（约 7h）后即可进入 ⑩ 交付**。
>
> ⑨ 阶段修复工作量约 7-10h（必修 + 推荐），不算重。**架构债务（repositories 层 / 单一职责拆分）可⑩ / ⑪ 之后清理**，不阻塞本项目交付 DoD。

---

## 8. 完成项

- [x] 三轮合并去重（REVIEW 14 + Lane 1 16 + Lane 2 16 → 37 项去重）
- [x] ⑨ 必修清单 12 项（CRITICAL + 关键 HIGH，~4h）
- [x] ⑨ 推荐清单 13 项（其余 HIGH + MEDIUM，~5h）
- [x] ⑨ 修复后回归验证清单（12 步）
- [x] ⑩ 延后清单（4 项架构债务 / 不阻塞）
- [x] 综合评分 6 维度
- [x] 最终裁决 REQUEST CHANGES（理由充分，可修）