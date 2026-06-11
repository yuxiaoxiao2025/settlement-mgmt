# Track 3 报告 — 架构 / 端到端一致性 / 用户体验（HEAD=c19c536）

> 我（Mavis）作为架构师视角对项目做的独立审查。结论与 Track 1/2 **多处交叉**——这表明问题真实而非臆测。

## 架构优点

1. **分层清晰**：router → service → model 边界分明，router 几乎不做业务逻辑（除 settlement 同步生成是已知妥协）。SQLAlchemy ORM 关系 + Pydantic schema 校验把数据层与传输层解耦。
2. **配置 ENV 化**：`config.py` 用 pydantic-settings 统一读取，docker compose 注入环境变量，无硬编码路径。`f-string` 拼路径（database.py:7）也走 `settings.DB_PATH`，**安全**。
3. **watcher 双轨降级务实**：watchdog 不可用时 APScheduler 兜底，启动时 `_scan_projects_dir` 初始化快照避免冷启动全 created（watcher_service.py:130-134）—— 教科书级 no-fail 降级。
4. **TanStack Query 状态边界**：`useAppStore` 只存 toast + projectId（zundand），其它都交给 TanStack Query —— 单一数据源干净。
5. **删除项目走 ORM cascade**（models.py:31）—— items / files / settlement_logs 一次性级联，DB 不留孤儿。
6. **docker 化干净**：后端 / 前端 / 卷挂载 / 健康检查 / 网络拓扑 / 端口固定（18080/18000）—— 一条 `docker compose up` 即可用。

## Critical（架构级 — 不可逆 / 不可绕过）

### C-font：**Linux 容器内中文字体错配，结算书 PDF 全是豆腐块**
**位置**：`backend/Dockerfile:21`（`apt-get install fonts-noto-cjk`）+ `backend/app/services/settlement_builder.py:23-56`

**复现**（docker 内已实测）：
```
[FONT] 结算书字体：正文=STSong-Light, 标题=Helvetica-Bold
```

**调用链**：
1. `backend/Dockerfile:21` 装 `fonts-noto-cjk`（思源黑体）到 `/usr/share/fonts/opentype/noto/`
2. `settlement_builder.py:25-35` Linux 分支 candidates 写死 `/usr/share/fonts/truetype/wqy/wqy-microhei.ttc`（**文泉驿**）
3. 两个目录**完全错配** → 容器内 Linux 分支一个 candidate 都匹配不上
4. `settlement_builder.py:49-55` 回退到 `reportlab.pdfbase.cidfonts.UnicodeCIDFont("STSong-Light")`（**内置 CID 字体**）
5. 标题字体 `Helvetica-Bold`（**英文粗体**！中文乱码）
6. pypdf 抽文字 latin-1 字节，视觉豆腐块 → **截图 `docs/screenshots/12-docker-chinese-broken.png` 已存证**

**为什么之前没发现**：开发模式（venv 跑后端）在 Windows 走 SimSun/SimHei 完全正常；docker 化**从未生成过真实结算书 PDF**（之前测试用的"结算书预览测试项目"是 v0.1.0 时期 Windows 生成的，commit 6eb5d00 之后**没新生成过 PDF**）。

**修复方向**：
- 改 `settlement_builder.py:25-35` Linux 分支用 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` + `NotoSansCJK-Bold.ttc`
- 或探测多路径（`Path("/usr/share/fonts/opentype/noto").rglob("Noto*.ot[fc]")`），找到就用
- **invariant（必须保留）**：NotoCJK + WQY + STSong-Light 三者全失败必须显式 `raise`（不静默走 Helvetica）—— 防 silent failure 链再绕回去
- 测试加一项：docker 内生成结算书 + pypdf 抽文字断言含"移交日期"等中文（防回归）

**lesson 持久化**（已写 user memory）：用户偏好"轻改"导致 silent bug 难发现。CI 164 个测试全过，但**生产环境 PDF 全是豆腐块**——silent failure 比 throw 更难发现。

### C-status：**deadline 校验函数名撒谎 — schema 接受过去日期**
**位置**：`backend/app/schemas.py:22-27`
```python
def deadline_must_be_future(cls, v: date, info):
    if "handover_date" in info.data and info.data["handover_date"] and v < info.data["handover_date"]:
        raise ValueError("截止日期不可早于移交日期")
    return v
```

**问题**：函数名 `must_be_future` 但**只校验 ≥ handover_date，从不跟今天比**。前端 ProjectNew.tsx:106-108 客户端校验"截止日期不可早于今天"成了唯一防线 —— **任何 API 直接调用者（curl / ReDoc）都能建过去项目**。

**复现**：`curl -X POST /api/projects -d '{"name":"已过期","deadline":"2020-01-01"}'` → 201。

**修复**：加 `if v < date.today(): raise ValueError("截止日期不可早于今天")`（Track 2 C2 一致）。

**为什么 Track 1 漏报**：Track 1 关注 schema 对齐与代码风格，没仔细看 validator 语义。**双 reviewer 互补的价值**。

## Important（架构级 — 一致性 / 体验）

### I-key：**ProjectDetail query key 漂移 — mutation 不刷 UI**
**位置**：`frontend/src/pages/ProjectDetail.tsx:387-399` 自定义 `useProject` + `['project', id]`（与 `hooks/useProjects.ts:62` 的 `projectKeys.byId(id)` **不匹配**）

**问题**：mutations `invalidateQueries(projectKeys.list())` 和 `projectKeys.byId(id)`，但 ProjectDetail 自定义 `useProject` 用 `['project', id]` —— **5 秒轮询的 key 不是 mutations invalidate 的 key**，会出现「mutation 成功但 UI 不刷」的最坏情况（虽然 5s 轮询兜底，但用户感觉"卡了"）。

**修复**：删 ProjectDetail 自定义 `useProject`，统一用 `useProject(id)` from `@/hooks/useProjects`（已有）。Track 1 I2 一致。

### I-files：**watcher 自循环 ingest `.pdfs/`**
**位置**：`backend/app/services/file_service.py:26-30` + `backend/app/services/watcher_service.py:38-65`

**问题**：`file_service._try_convert_to_pdf` 把转码 PDF 写到 `projects/<id>/.pdfs/`，但 `_scan_projects_dir` 第 42 行只跳过 `meta.json` —— **不跳过 `.pdfs` 目录**。结果：WPS 转码生成的 PDF 也会被 watcher 重复 ingest，触发"original_path 不同但 pdf_path 指向自己"的自循环。

**修复**：watcher `_scan_projects_dir` 跳过 `.pdfs/` `_unclaimed/` `.tmp/`。Track 2 I2 一致。

### I-contract：**SettlementJobResponse 字段名不匹配 — 前端 toast 显示 undefined**
**位置**：`backend/app/services/item_service.py:135` 返回 `version` vs `frontend/src/types/index.ts:141` 期望 `new_version`

**问题**：用户到 `/template` 推广一个项 → 前端 `pushToast('success', \`已添加「${name}」到全局模版（v${result.new_version}，共 ${result.total_items} 项）\`)` → `result.new_version` 是 `undefined` → 显示 "vundefined"。

**修复**：改 item_service.py:135 把 `version` 改成 `new_version`（或前端 types 用 `version`）。Track 2 I4 一致。

### I-cache：**nginx proxy_buffering off → 大 PDF 预览白屏**
**位置**：`backend/app/routers/settlement.py:106-115` + `frontend/nginx.conf:23-32`

**问题**：`proxy_buffering off; proxy_request_buffering off` 让 nginx 流式转发，PDF.js 在 Safari/Edge 旧版对**流式 application/pdf** 的渲染需要 `Content-Length` 头 → 偶发白屏。

**修复**：nginx 给 inline 端点单独加 `proxy_buffering on; gzip off;` + `add_header Accept-Ranges bytes`。

**为什么 Track 1/2 漏报**：Track 1 不看 nginx，Track 2 看到了但归为 P3。我升 Important——大结算书（60+ 页 5MB+）是核心交付物。

### I-empty-build：**0 项项目可 build 出空结算书（仅封面+目录）**
**位置**：`backend/app/routers/settlement.py:50-80`

**问题**：`selected_template_seqs: []` 创建的项目 `progress.total = 0`，`settlement_builder.build_settlement` 校验 `not_confirmed`（空项目 → `[]`）→ 能进 build → 0 项结算书仅封面 + 目录 → 用户可能误以为成功。

**修复**：build 接口加 `if items == []: raise 422`。

### I-state：**2 项流程 location.state 刷新即丢，无 sessionStorage 兜底**
**位置**：`frontend/src/pages/ProjectNewTemplate.tsx:14-17`（注释说"刷新即丢"）

**问题**：用户填了 30 分钟项目信息，第 2 步误点刷新 → state 没了 → useEffect 触发 navigate → 表单全丢。**没任何提示**。

**修复**：ProjectNew 表单 state 用 sessionStorage 持久化 + 顶部"草稿未保存"提示。

## Minor（架构级 — 演化 / 文档）

### M-arch：**无数据库迁移机制（alembic）**
**位置**：`backend/app/database.py:26-29` `init_db()` 调 `Base.metadata.create_all`

**问题**：生产期零迁移能力。加字段、改类型都得手动 SQL。当前 v0.1.0 还能撑，加 schema 时建议上 alembic。

### M-port：**dockerfile EXPOSE / ENV PORT 与实际 --port 18000 不一致**
**位置**：`backend/Dockerfile:39,45`（EXPOSE 8000、ENV PORT=8000）vs `CMD --port 18000` vs `HEALTHCHECK .../18000/...`

**问题**：3 个地方写 3 个端口，CMD 实际赢，但 EXPOSE + ENV 是误导。Track 2 M1 一致。

### M-archive：**归档 0 项项目可绕过**
**位置**：`backend/app/routers/projects.py:74-100`

**问题**：`selected_template_seqs: []` 创建的 0 项项目，`unconfirmed = 0` → 走"全部 confirmed"分支 → 能 archive。但 progress.total = 0 的项目 archive 是不是预期？**SPEC 不明**。Track 2 I1 一致。

### M-stale：**watcher `_scan_projects_dir` 的 `_known_files.clear()` 与 `update()` 之间没锁**
**位置**：`backend/app/services/watcher_service.py:51-63`

**问题**：多线程并发下会丢失条目（虽然 APScheduler 单线程，但 watchdog handler 跑在它自己的线程）。

**修复**：外层加 `_snapshot_lock` 覆盖整个 current/known_files 比对与替换。

### M-async：**settlement 同步阻塞 HTTP 线程**
**位置**：`backend/app/routers/settlement.py:50-80`（同步）+ `backend/Dockerfile:48`（`--workers 1`）

**问题**：单 worker 下大 PDF 合并 60s+ 期间**所有用户 HTTP 全部卡 60s**。

**修复**：改 BackgroundTasks + status 轮询（前端已有 polling 模式）。

### M-empty-archive-unconfirmed：**归档三态测试缺失**
**位置**：`backend/tests/test_projects.py`

**问题**：只有 `test_archive_project_with_pending_items_returns_409` 一种 negative。**缺**：
- 25 项全 confirmed → 200
- 25 项有 1 项 rejected → 409
- 0 项项目 → 200（边界，SPEC 待定）

### M-comment：**`api/client.ts:2` 注释说"Vite 代理到 127.0.0.1:8000" — 过时**
**位置**：`frontend/src/api/client.ts:2`

**问题**：docker 化后用 nginx 反代到 `backend:18000`，注释误导。

---

## 总评

**架构核心无重大问题**（分层、降级、ENV、契约对齐都不错），但**部署到 docker 后出现了 silent failure**（字体 Critical）—— 这是 Track 3 独立于 Track 1/2 发现的最大 Critical。

**两个 Track 没看 docker 内实跑**（只读代码），我**实际跑了一下生成结算书**就立刻暴露了——**silent failure 比 throw 更难发现**，CI 164 测试都过不代表生产对。

**建议⑨阶段必修**：
1. **C-font**（docker 中文字体错配——影响核心交付物 PDF）
2. **C-status**（deadline 校验撒谎——1 行修）
3. **I-files**（watcher 自循环 .pdfs——3 行修）
4. **I-contract**（version vs new_version——1 行修）
5. **I-key**（query key 漂移——1 文件改）
6. **I-empty-build**（0 项项目空结算书——1 文件改）

**建议⑩阶段再处理**：
- C-cache（nginx buffer 优化）
- I-archive（归档 0 项项目语义）
- I-state（2 步流程 sessionStorage 兜底）
- M-arch（alembic 迁移）
- M-async（settlement 异步化）

**放到 backlog**：
- C1（Track 2，DELETE 无鉴权）—— **本就是 LAN 工具**，鉴权是产品决策不是技术债；建议 README 显著位置加 warning
- M-stale / M-port / M-comment / M-empty-archive-unconfirmed（小修）
