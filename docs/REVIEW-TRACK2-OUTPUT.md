# Verifier Track 2 Report — ⑧.5 独立审查

## 覆盖良好的地方

- `paths.safe_join()`（backend/app/core/paths.py:6-17）：用 `Path.resolve() + relative_to` 防越界，正确处理 Windows 反斜杠。
- `Project.id` 用 `uuid.uuid4`（backend/app/models.py:13）— 不可枚举，杜绝 IDOR 暴力枚举。
- `template_loader._sanitize_name()`（backend/app/core/template_loader.py:9-17）：替换 Windows 非法字符 + 去括号 + 截断 50 字符，正确。
- `settlement_builder._register_cn_fonts()`（backend/app/services/settlement_builder.py:23-56）：容器内 fonts-noto-cjk + Windows 字体双路径，回退 STSong-Light — 处理得当。
- 删除项目走 `db.delete(p)` + `cascade="all, delete-orphan"`（models.py:31）— items/files/logs 一次性级联删，DB 不会留孤儿。
- nginx 反代 `client_max_body_size 500M`（nginx.conf:9）— 与大文件上传场景匹配。
- `pdf_converter` 失败时静默降级为 None（pdf_converter.py:42-53）— 不影响主流程入库，UI 可提示。
- `watcher_service` 双保险（watchdog + APScheduler 兜底）+ 启动时 `_scan_projects_dir` 初始化快照（watcher_service.py:130-134）— 避免冷启动把所有现存文件当 created。
- settlement 同步生成 + `output_path` 直接走 ORM（settlement_builder.py:175-269）— 失败状态写 `settlement_logs.error`，前端可读。
- 前端 2 步流程在 `navigate('/projects/new', { state: basic })` 双向回灌（ProjectNewTemplate.tsx:225）— 第 2 步点「上一步」能恢复。
- 模板多选用 `Set` + 容错（无效 seq 静默忽略）— test_create_project_with_invalid_seq_silently_ignored 已覆盖。
- access log 中间件 `try/except` 静默（main.py:118）— 写盘失败不阻塞请求。

## Critical（必须修 — 安全 / 数据丢失）

### C1：DELETE 接口无任何鉴权 → 局域网任意客户端可硬删项目
**位置**：`backend/app/routers/projects.py:103-132` + `backend/app/routers/items.py:86-92` + `backend/app/routers/files.py:88-95`
**问题**：项目定位是"局域网工具"（config.LAN_MODE=True, HOST=0.0.0.0），但 DELETE 系列路由没有任何鉴权。`docker-compose.yml:39` 还显式把 CORS 设成 `["http://localhost","http://localhost:18080","http://127.0.0.1","http://127.0.0.1:18080"]` —— 这只限制了浏览器跨域来源，**curl/Postman/恶意脚本**完全不受限。`delete_project` 走 `shutil.rmtree(project_dir)`（projects.py:126），对**整个项目目录 + 25 个子文件夹 + final/ 结算书 PDF**直接永久删除。
**复现**：局域网内任何机器 `curl -X DELETE http://192.168.x.x:18000/api/projects/<id>` → 200，项目和所有资料瞬间消失。`delete_file` 同样不鉴权。
**修复建议**：
- 至少加 LAN token 校验（`X-LAN-Token` header + 环境变量 `LAN_TOKEN` 必填才能启动）。
- 或加 `LAN_MODE=False` 默认，且 `LAN_MODE=True` 时强制要求 token。
- 必须在 CLAUDE.md/README 显著位置提示"仅在受信局域网使用"。

### C2：deadline 校验函数名撒谎 — schema 接受过去日期
**位置**：`backend/app/schemas.py:22-27`
```python
@field_validator("deadline")
@classmethod
def deadline_must_be_future(cls, v: date, info):
    if "handover_date" in info.data and info.data["handover_date"] and v < info.data["handover_date"]:
        raise ValueError("截止日期不可早于移交日期")
    return v
```
**问题**：函数名叫 `must_be_future`，但**只校验 ≥ handover_date，从不跟今天比**。`test_create_project_deadline_in_past`（test_projects.py:81-87）甚至明说"接受 201 或 422" — 测试用 `assert r.status_code in (201, 422)` 蒙混过关，实际**后端会 201 创建 2020 年的项目**。前端 ProjectNew.tsx:106-108 的客户端校验"截止日期不可早于今天"成了唯一防线 — 任何 API 直接调用者（curl / ReDoc）都能建过去项目。
**复现**：`curl -X POST http://x:18000/api/projects -H "Content-Type: application/json" -d '{"name":"已过期","deadline":"2020-01-01"}'` → 201。
**修复建议**：
```python
from datetime import date
@field_validator("deadline")
@classmethod
def deadline_must_be_future(cls, v: date, info):
    if v < date.today():
        raise ValueError("截止日期不可早于今天")
    if "handover_date" in info.data and info.data["handover_date"] and v < info.data["handover_date"]:
        raise ValueError("截止日期不可早于移交日期")
    return v
```
同时改 test_create_project_deadline_in_past 为 `assert r.status_code == 422`。

### C3：删除项目时，DB 删成功但磁盘 rmtree 失败 → 数据孤儿
**位置**：`backend/app/routers/projects.py:118-132`
**问题**：`db.delete(p); db.commit()` 在 line 119-120 先成功，然后 line 126 跑 `shutil.rmtree` —— 如果目录里有文件被占用（Windows 上 PDF 正被 Adobe 打开）抛 `OSError`，代码只 `logger.warning` 继续返回 204。**前端拿 204 后跳走，磁盘上整个项目目录 + 25 个子文件夹 + final/ 全部留尸**。`DELETE /api/projects/{id}` 第二次调用 `p = db.query(Project).filter(...).first()` → 404（DB 已没记录），磁盘孤儿再也没人能清。
**复现**：先 build 一份结算书 → 用户双击打开 PDF → 后端 DELETE /api/projects/{pid} → on Windows PDF 句柄锁住 → rmtree 失败 → 204。
**修复建议**：
- 顺序倒过来：先 rmtree，失败回 500，DB 记录保持可重试。
- 或在响应里加字段 `{"deleted_db": true, "deleted_disk": false, "leftover_path": "..."}`，前端展示给用户。
- 同时把这条 warning 升级为 error 并写入 access_log。

## Important（建议修 — 测试缺失 / 集成风险）

### I1：归档路径缺"无 item"项目支持 + 并发归档 race
**位置**：`backend/app/routers/projects.py:74-100`
- **场景 A**：用户用 `selected_template_seqs: []` 创建一个 0 项项目（test_projects.py:248 已支持），再点归档 → `_confirm_all_items` 永远不会被调用（因为没有 item）→ 项目永远是 active，**无法归档也无法被 archive 接口处理**。`unconfirmed` count = 0 时 `if unconfirmed > 0: raise 409` —— 0 项时实际**能归档**，但 `progress.total = 0` 的项目能 archive 是不是预期？SPEC 不明。
- **场景 B**：两个用户同时点归档 → 两个事务都读 `unconfirmed=0`，两个都 `p.status = "archived"`，第二个 commit 时**没冲突**（后写覆盖）。SQLite 单写者本不会真出 race，但 PG/MySQL 部署时就需要 SELECT FOR UPDATE。
- **缺失测试**：归档（25 项全 confirmed、25 项有 1 项 rejected、0 项项目）的完整三态覆盖 —— 当前只有 `test_archive_project_with_pending_items_returns_409` 一种 negative case。

### I2：watcher 容器内 vs 宿主机文件时间戳差异 + `.pdfs` 子目录
**位置**：`backend/app/services/watcher_service.py:38-65` + `backend/app/services/file_service.py:26-30`
- **问题 1**：docker compose 把 `./projects` 挂到容器内 `/projects`（docker-compose.yml:28）。宿主机用户把 USB 文件 `cp projects/xxx/01_a/foo.pdf` —— 文件 mtime 是宿主机时钟。**容器内 `_scan_projects_dir` 走 `p.stat().st_mtime`** 拿到的也是宿主机时钟（bind mount 直通），所以基础场景正常。但 docker 在 Windows + WSL2 场景下**已知会做 mtime 归一化**（FAT/SMB 挂载），可能导致：
  - 宿主机先 cp → 容器内秒级看不到（APScheduler 兜底 5s 后能补上）
  - 大量小文件同时 cp → APScheduler 单线程顺序处理，**首个文件的 created 事件在 watchdog 路径上 fire 之前被兜底覆盖**，debounce 失效（trailing edge 在 fast poll 期间被反复 reset）。
- **问题 2**：file_service.py:26 把转码 PDF 写到 `projects/<id>/.pdfs/`，但 `_scan_projects_dir` 第 42 行 `if p.name == "meta.json": continue` —— **没排除 `.pdfs` 目录**。结果：WPS 转码生成的 PDF 也会被 watcher 重复 ingest，触发"original_path 不同但 pdf_path 指向自己"的自循环。
- **建议**：watcher 跳过 `.pdfs` / `_unclaimed` / `.tmp`；或把转码产物放到项目根目录外的 `~/.cache/pdfs/<id>/`。

### I3：结算书 inline preview 在 nginx 反代下可能丢失 `Content-Disposition: inline`
**位置**：`backend/app/routers/settlement.py:106-115` + `frontend/nginx.conf:23-32`
- **问题**：FastAPI 用 `FileResponse(content_disposition_type="inline")` 设的是 `Content-Disposition: inline; filename=xxx.pdf`，但 `gzip on; gzip_types ...`（nginx.conf:14-15）只压缩 text 系列，PDF 不在 gzip 列表，**理论上不被压缩**。但 `proxy_buffering off; proxy_request_buffering off`（nginx.conf:30-31）会逐 chunk 流式转发 chunked encoding，**PDF.js 在某些浏览器（Safari、Edge 旧版）对流式 application/pdf 的渲染需要 `Content-Length` 头**，当前没有显式 disable chunked → 用户 inline 预览偶发"无法显示 PDF"。
- **复现**：build 一份 50MB+ 结算书 → 浏览器内嵌预览 → 偶发白屏。
- **建议**：nginx 给 `/api/files/*/preview` 和 `/api/projects/*/settlement/preview-pdf` 这两个 inline 端点单独加 `proxy_buffering on; gzip off;`，并显式 `add_header Accept-Ranges bytes`。

### I4：前后端 API 契约：SettlementJobResponse 字段名不匹配
**位置**：`backend/app/schemas.py:156-163` vs `frontend/src/types/index.ts:163-171`
- 后端 `SettlementJobResponse` 字段：`job_id, status, started_at, finished_at, output_path, file_size, error`
- 前端 `SettlementJob` 字段：`job_id?, status, started_at?, finished_at?, output_path?, file_size?, error?`
- **前后端字段名一致** ✓
- **但**：前端 `PromoteResponse.new_version`（types/index.ts:141）vs 后端 `PromoteResponse`（schemas.py:144）实际返回 `version`（item_service.py:135）。**前后端字段名不一致**！前端期望 `new_version`，后端返回 `version`。
- **复现**：用户到 /template 推广一个项 → 前端 pushToast 用 `data.new_version` → undefined → 显示"undefined"或 toast 不出来。
- **修复**：改 item_service.py:135 把 `version` 改成 `new_version`，或改前端 types 用 `version`。

### I5：缺并发 confirm / 100MB+ 大文件 / 同时覆盖 三类核心边界测试
- **并发 confirm 同一 item**：两个浏览器同时点确认 → 两个事务都从 `uploaded` 读到 → 两个都 set confirmed → DB 看似 OK，但 `confirmed_at` 被后写覆盖，**审计追溯不到第一次确认时间**。
- **大文件上传**：未测试 100MB+。前端 `client_max_body_size 500M` 配 nginx，但 `proxy_request_buffering off`（nginx.conf:31）会让 FastAPI 边收边写 `original_path` 落盘，**Starlette UploadFile 默认 1MB 内存缓冲**（实际是 `python-multipart` 默认 chunk size 1MB）—— 没问题，但 `wps_converter timeout=120s`（pdf_converter.py:23）**对 500MB 文件转码根本不够**，但当前**没有任何上传 API 存在**（只是 watcher 监听文件落地），所以这条仅在引入"前端拖拽上传"时爆发。
- **同时覆盖**：file_service.py:127-146 upsert 用 `(item_id, filename)` 唯一键 —— **没有真唯一约束**（schema 没建），只是 query 找 existing。**两个并发 ingest 同一文件 → 两条 File 记录**。
- **修复**：给 (item_id, filename) 加 `UniqueConstraint`；或文件写入用临时名 + atomic rename；或确认接口加 `If-Match` ETag。

## Minor（可选 — 文档 / 优化）

### M1：docker-compose 端口 18000 与 backend/Dockerfile EXPOSE 8000 不一致
**位置**：`backend/Dockerfile:39,45` vs `docker-compose.yml:25` vs `backend/Dockerfile:42-43`（HEALTHCHECK 写的 18000）
- Dockerfile ENV `PORT=8000`、EXPOSE 8000，CMD 里却 `--port 18000`，HEALTHCHECK 又写 `http://127.0.0.1:18000/api/health`。
- 实际跑的是 18000（CMD 赢），但 8000 EXPOSE + ENV 是误导。
- **建议**：统一为 18000（外部端口 + 容器内端口都一致），删 EXPOSE 8000。

### M2：access_log 字段 `timestamp` 在 model 里没 `default=datetime.utcnow`
**位置**：`backend/app/models.py:91-99`
- `AccessLog` 模型里 `timestamp = Column(DateTime, default=datetime.utcnow)` ✓ 有 default。
- 但 main.py:108-117 写入时**没传 `timestamp`**，靠 default —— **SQLite + 显式 `default=` 在某些 SQLAlchemy 2.0 风格下需要 `server_default`**，不是 client side default。
- **建议**：加 `server_default=func.now()` 兜底。

### M3：settlement 同步生成阻塞 HTTP 线程
**位置**：`backend/app/routers/settlement.py:50-80`
- `_check_readiness` 之后 `settlement_builder.build_settlement` 同步跑，**单线程 FastAPI worker 全部期间不能处理别的请求**（注释 line 63 也提到"便于测试"）。
- 当前单 worker（Dockerfile:48 CMD `--workers 1`）→ 大 PDF 合并 60s+ 时，**所有用户 HTTP 请求全部卡 60s**。
- **建议**：改成 BackgroundTasks + status 轮询（`/api/projects/{id}/settlement/status` 已存在），前端已有 polling 模式。

### M4：test_projects.py:248 空项目归档路径未覆盖
- `selected_template_seqs: []` 创建的项目 `progress.total = 0`，归档时 `unconfirmed = 0`，能 200。
- 但 `days_to_deadline`（project_service.py:108）用 `date.today()` 算，**没有"无 deadline"分支**（deadline 必填）—— 这条 OK。
- 但 settlement `build` 校验 `if not_confirmed: raise ValueError`（settlement_builder.py:171）—— `not_confirmed = []`（空项目）→ 能进 build → 0 项结算书仅封面 + 目录 → 用户可能误以为成功了。
- **建议**：build 接口加 `items == []` 校验返回 422。

### M5：前端 2 步流程"刷新即丢"文档未警示
**位置**：`ProjectNewTemplate.tsx:14-17` + 注释说"刷新即丢，符合'草稿'语义"
- 用户填了 30 分钟项目信息，第 2 步误点刷新 → location.state 没了 → useEffect 触发 `navigate('/projects/new', { replace: true })`（line 119-125）→ 表单数据全丢。
- **建议**：至少加 sessionStorage 持久化 + 显眼的"草稿未保存"提示。

## Cross-Track 备注（Track 3 补全，2026-06-11 16:38）

### C-font（font path mismatch — Track 3 升级为 Critical）
**位置**：`backend/Dockerfile:21`（`apt-get install fonts-noto-cjk`） + `backend/app/services/settlement_builder.py:23-56`
- **错配链**：
  1. `backend/Dockerfile:21` 装 `fonts-noto-cjk`（思源黑体）到 `/usr/share/fonts/opentype/noto/`
  2. `settlement_builder.py:25-35` Linux 分支 candidates 写死 `/usr/share/fonts/truetype/wqy/wqy-microhei.ttc`（文泉驿）
  3. 两个目录**完全错配** → 容器内 Linux 分支一个 candidate 都匹配不上
  4. `settlement_builder.py:49-55` 回退到 `reportlab.pdfbase.cidfonts.UnicodeCIDFont("STSong-Light")`
  5. **实际日志**（Track 3 拉取确认）：`body=STSong-Light, heading=Helvetica-Bold`（**英文粗体！**）
  6. pypdf 抽文字 latin-1 字节，视觉豆腐块
- **本质**：Dockerfile 装的字体 + 代码硬编码的字体路径 **没有任何交叉验证**。我 Track 2 在 M 段"覆盖良好的地方"提到"字体回退双路径（Windows + 容器 fonts-noto-cjk）"—— **错！** 实际只回退到 STSong-Light，**容器内 Noto 字体永远走不到**。应把这条从"覆盖良好"挪到 Critical。
- **修复方向**（user 拍板后 Track 3 实施）：
  - 改 `settlement_builder.py:25-35` Linux 分支用 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` + `NotoSansCJK-Bold.ttc`
  - 或探测多路径（哪个 .ttc/.otf/.ttf 存在就用哪个）
  - 启动时 WARN：探测失败时打 `[FONT-WARN] 容器内未找到任何 CJK 字体`，避免静默
  - 测试加一项：docker 内生成结算书 + pypdf 抽文字断言含中文（防回归）
- **lesson（持久化）**：用户连续多次要求"**轻改**" / "**兼容后升级**" / "**避免 breaking**"——字体路径这种是 silent bug（不报错），CI 跑 164 个测试都过，但生产环境 PDF 全是豆腐块。**silent failure 比 throw 更难发现**。

### fonts-noto-cjk 路径 + STSong-Light 不可同时为空
（**constraint** — Track 3 修复后必须保留此 invariant）：settlement 启动时如果 NotoCJK + WQY + STSong-Light 三者全失败，必须**显式 raise 或打 ERROR**（不能静默走 Helvetica），否则又回到当前 silent fallback 链。
