# DESIGN — 项目结算资料管理系统

> 阶段：③ 设计（dev-pipeline-mavis）
> 编排者：Mavis
> 日期：2026-06-09
> 关联：`docs/REQUIREMENT.md` v1.0、`docs/SPEC.md` v1.0

---

## 1. 技术栈定型

### 1.1 后端

| 库 | 版本 | 用途 |
|----|------|------|
| Python | 3.11+ | 运行时 |
| FastAPI | 0.115+ | Web 框架 |
| uvicorn[standard] | 0.32+ | ASGI 服务器 |
| SQLAlchemy | 2.0+ | ORM |
| sqlite (stdlib) | - | 数据库 |
| watchdog | 4.0+ | 文件监听 |
| python-docx | 1.1+ | 解析 .docx 模版 |
| pypdf | 5.0+ | PDF 合并 + 页码 |
| reportlab | 4.0+ | 生成封面 + 目录 |
| pydantic | 2.0+ | 数据校验 |
| pydantic-settings | 2.0+ | 配置管理 |
| aiofiles | 24+ | 异步文件 I/O |
| python-multipart | 0.0.12+ | 文件上传 |
| APScheduler | 3.10+ | 兜底轮询（监听失败时） |
| pytest | 8+ | 测试 |
| httpx | 0.27+ | 测试 API 客户端 |

### 1.2 前端

| 库 | 版本 | 用途 |
|----|------|------|
| React | 18+ | UI 框架 |
| Vite | 5+ | 构建工具 |
| TypeScript | 5+ | 类型 |
| React Router | 6+ | 路由 |
| TanStack Query | 5+ | 数据获取 + 缓存 |
| Zustand | 4+ | 轻量全局状态 |
| TailwindCSS | 3+ | 样式 |
| lucide-react | 0.4+ | 图标 |
| axios | 1+ | HTTP |
| vitest | 1+ | 单元测试 |

### 1.3 外部依赖

| 工具 | 用途 | 检查方式 |
|------|------|---------|
| WPS Office | Word/Excel → PDF | `where wps` |
| Git | 版本控制 | 已有 |
| 7-Zip（可选） | 压缩备份 | `where 7z` |

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器（局域网多端）                    │
│   React + Vite + TS + Tailwind + TanStack Query         │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (REST/JSON)
                           │ /api/*
                           │
┌──────────────────────────▼──────────────────────────────┐
│              FastAPI + uvicorn (0.0.0.0:8000)            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Routers                                         │    │
│  │  ├── /projects        (CRUD)                     │    │
│  │  ├── /items           (CRUD + state machine)     │    │
│  │  ├── /files           (upload/preview/download)  │    │
│  │  ├── /template        (master_template.json)     │    │
│  │  └── /settlement      (build/download)           │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Services（业务逻辑层）                            │    │
│  │  ├── ProjectService      增删改查 + 创建文件夹    │    │
│  │  ├── ItemService         状态机 + 编辑            │    │
│  │  ├── FileService         匹配 + 预览              │    │
│  │  ├── WatcherService      watchdog observer        │    │
│  │  ├── PdfConverter        WPS CLI 封装             │    │
│  │  └── SettlementBuilder   封面 + 目录 + 合并        │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Repositories（数据访问层，SQLAlchemy）            │    │
│  │  └── ProjectRepo / ItemRepo / FileRepo / LogRepo │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌──────────┐       ┌──────────┐
   │ SQLite  │       │ projects/│       │  WPS CLI │
   │ data/   │       │  文件树  │       │ (subproc)│
   │ *.db    │       │          │       │          │
   └─────────┘       └──────────┘       └──────────┘
```

### 数据流总览

```
                  ┌──────────┐
   文件拖入 ─────▶│ 物理目录 │
                  │projects/ │
                  └────┬─────┘
                       │ watchdog 事件
                       ▼
                  ┌──────────┐
                  │ Watcher  │ (去抖 2s)
                  │ Service  │
                  └────┬─────┘
                       │ 文件路径
                       ▼
                  ┌──────────┐
                  │ File     │ 归属判断:
                  │ Service  │ ① 子文件夹 ② 模糊匹配 ③ 待认领
                  └────┬─────┘
                       │ file_id + item_id
                       ▼
                  ┌──────────┐
                  │ SQLite   │ (状态: pending→uploaded)
                  │ files    │
                  └────┬─────┘
                       │ (若非 PDF)
                       ▼
                  ┌──────────┐
                  │ Pdf      │ WPS CLI
                  │ Converter│ (异步)
                  └────┬─────┘
                       │ pdf_path
                       ▼
                  ┌──────────┐
                  │ SQLite   │ (更新 pdf_path)
                  └────┬─────┘
                       │ 用户点确认
                       ▼
                  ┌──────────┐
                  │ Item     │ 状态: uploaded→confirmed
                  │ Service  │
                  └──────────┘
```

## 3. 项目目录结构

```
E:\trae-pc\260609work2\
├── docs/                              # 设计文档
│   ├── REQUIREMENT.md
│   ├── SPEC.md
│   ├── DESIGN.md
│   ├── PLAN.md
│   ├── ALIGNMENT.md
│   ├── REVIEW.md
│   └── DELIVERY.md
│
├── backend/                           # 后端服务
│   ├── pyproject.toml                 # 依赖
│   ├── requirements.txt               # 备用依赖清单
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI 入口
│   │   ├── config.py                  # pydantic-settings
│   │   ├── database.py                # SQLAlchemy engine + session
│   │   ├── models.py                  # ORM 模型
│   │   ├── schemas.py                 # Pydantic 模型
│   │   ├── deps.py                    # FastAPI Depends
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── projects.py
│   │   │   ├── items.py
│   │   │   ├── files.py
│   │   │   ├── template.py
│   │   │   └── settlement.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── project_service.py
│   │   │   ├── item_service.py
│   │   │   ├── file_service.py
│   │   │   ├── watcher_service.py
│   │   │   ├── pdf_converter.py
│   │   │   └── settlement_builder.py
│   │   ├── repositories/
│   │   │   ├── __init__.py
│   │   │   ├── project_repo.py
│   │   │   ├── item_repo.py
│   │   │   └── file_repo.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── template_loader.py     # 解析 .docx 模版
│   │   │   ├── matching.py            # 文件名模糊匹配
│   │   │   └── paths.py               # 路径工具
│   │   └── templates/                 # 报告模板
│   │       └── settlement_cover.py    # 封面生成器
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_projects.py
│   │   ├── test_items.py
│   │   ├── test_files.py
│   │   ├── test_matching.py
│   │   └── test_settlement.py
│   └── scripts/
│       ├── bootstrap_template.py      # 一次性：解析 docx → master_template.json
│       └── check_wps.py               # 探测 WPS CLI
│
├── frontend/                          # 前端 SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts              # axios + interceptor
│   │   │   ├── projects.ts
│   │   │   ├── items.ts
│   │   │   ├── files.ts
│   │   │   ├── template.ts
│   │   │   └── settlement.ts
│   │   ├── pages/
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ProjectNew.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── ProjectEdit.tsx
│   │   │   ├── Settlement.tsx
│   │   │   └── TemplateManager.tsx
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── ItemRow.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── FileList.tsx
│   │   │   ├── UnclaimedFiles.tsx
│   │   │   ├── DeadlineCountdown.tsx
│   │   │   └── ProgressRing.tsx
│   │   ├── hooks/
│   │   │   ├── useProjects.ts
│   │   │   ├── useItems.ts
│   │   │   └── useDeadlineStatus.ts
│   │   ├── store/
│   │   │   └── app.ts                 # zustand
│   │   ├── lib/
│   │   │   ├── status.ts              # 状态颜色/图标
│   │   │   └── format.ts              # 日期/文件大小
│   │   └── types/
│   │       └── index.ts
│   └── tests/
│       └── *.test.tsx
│
├── data/                              # 数据
│   ├── master_template.json
│   └── settlement.db                  # SQLite (git-ignored)
│
├── projects/                          # 项目实例
│   └── <project-uuid>/
│       ├── meta.json                  # 项目元信息快照
│       ├── 01_招标文件/                # 资料子文件夹（25 个）
│       ├── 02_招标答疑文件/
│       ├── ...
│       ├── _unclaimed/                # 未匹配文件暂存
│       ├── .pdfs/                     # 转码后的 PDF
│       └── final/                     # 结算书
│
├── scripts/                           # 顶层脚本
│   ├── start.sh / start.bat           # 一键启动
│   └── bootstrap.sh / bootstrap.bat   # 初始化
│
├── CLAUDE.md
├── README.md
└── .gitignore
```

## 4. 关键流程

### 4.1 启动流程

```
python -m app.main
   │
   ├─ 加载 config（PORT、HOST、DB_PATH 等）
   ├─ 探测 WPS CLI 路径
   ├─ 初始化 SQLite（创建表）
   ├─ 检查 master_template.json，不存在则解析 .docx
   ├─ 启动 Watchdog observer
   ├─ 挂载 routers
   └─ uvicorn 启动（lifespan）
```

### 4.2 创建项目流程

```
POST /api/projects { name, deadline, ... }
   │
   ├─ Pydantic 校验
   ├─ 生成 uuid
   ├─ 在 projects/<uuid>/ 建 25 个子文件夹
   ├─ 在 items 表批量插入 25 条记录
   ├─ 在 projects 表插入记录
   └─ 返回 201 + project_id
```

### 4.3 文件落地处理链

```
watchdog 事件（on_created / on_modified / on_moved）
   │
   ├─ 2 秒去抖（避免编辑器多次保存）
   ├─ 判断路径范围（必须在 projects/<id>/ 内）
   ├─ 调用 file_service.ingest(path)
   │    │
   │    ├─ 解析项目 ID（从路径前两段）
   │    ├─ 解析归属：
   │    │   ├─ 在子文件夹里 → 解析 seq → 取对应 item
   │    │   ├─ 在项目根 → difflib 模糊匹配 → 取最佳 item
   │    │   └─ 都不命中 → 放入 _unclaimed/，UI 提示
   │    ├─ files 表 upsert
   │    └─ 更新 item.status
   └─ 若非 PDF，添加转码任务到 BackgroundTasks
```

### 4.4 模版成长流程

```
用户 POST /api/projects/{id}/items { name, description }
   │
   ├─ 在该项目的 items 表新增（is_extension=true）
   ├─ 检查是否需要建新子文件夹
   ├─ 读 master_template.json
   ├─ 检查 name 是否已存在
   ├─ 不存在 → 返回 { promote_prompt: true, item: {...} }
   └─ 前端弹"是否推广到全局模版"提示
        │
        └─ 用户确认 → POST /api/template/items
            ├─ 写入 master_template.json（version+=1）
            └─ 下次创建项目自动包含
```

### 4.5 结算书生成流程

```
POST /api/projects/{id}/settlement/build
   │
   ├─ 检查：所有 item.status == 'confirmed' → 否则 409
   ├─ 检查：每个 item 至少一个 is_primary 的 PDF
   ├─ 创建 settlement_jobs 记录（status=running）
   ├─ 异步执行（BackgroundTask）：
   │    │
   │    ├─ 用 reportlab 生成封面 PDF
   │    │   ├─ 标题（项目名）24pt
   │    │   ├─ 元信息（移交日期、截止日期、各方签字）
   │    │   └─ "项目结算资料交接清单"副标题
   │    │
   │    ├─ 生成目录页（先占位页码，最后回填）
   │    │
   │    ├─ 按 seq 顺序合并各 item 的 primary PDF
   │    │
   │    ├─ 计算每 item 的起始页码（get_page_number）
   │    │
   │    ├─ 用 reportlab 重写目录页
   │    │
   │    └─ 合并 [封面, 目录, 资料正文] → 写入 final/
   │
   └─ 写 settlement_logs
```

## 5. 关键技术决策

### 5.1 为什么用 SQLAlchemy 2.0 同步模式而不是 async

**决策**：用 SQLAlchemy 2.0 的同步 Session + 同步路由函数。
**理由**：
- 项目规模小（< 100 项目），同步性能足够
- 同步代码更易读、易测试
- 异步路径只在文件 I/O 和 WPS 调用

### 5.2 为什么用 watchdog 而不是轮询

**决策**：watchdog observer + 5s 兜底轮询。
**理由**：
- watchdog 实时、低 CPU
- 失败时（共享盘/SMB 协议不支持 inotify）APScheduler 兜底

### 5.3 为什么用 pypdf 而不是 pikepdf

**决策**：pypdf。
**理由**：
- pypdf 纯 Python，安装简单
- pikepdf 基于 QPDF，C++ 依赖，部署复杂
- 性能对于 25 份资料完全够用

### 5.4 为什么用 reportlab 生成封面而不是 docx

**决策**：reportlab 直接生成 PDF。
**理由**：
- 避免 WPS CLI 转码（启动开销 3-5 秒）
- 模板化封面（用 Platypus + 自定义字体）
- 中文字体用系统字体（simsun.ttf）

### 5.5 为什么用 Vite 而不是 CRA

**决策**：Vite。
**理由**：
- 启动快
- 原生 ESM
- TypeScript 一等公民

## 6. 数据流：状态变更全景

```
                    ┌──────────────┐
   项目创建 ──────▶│ projects 表   │◀── PATCH /api/projects/{id}
                    └──────┬───────┘
                           │ 1:N
                           ▼
                    ┌──────────────┐
                    │  items 表    │◀── POST /items, /confirm, /reject
                    │  (25+ 行)    │
                    └──────┬───────┘
                           │ 1:N
                           ▼
                    ┌──────────────┐
                    │  files 表    │◀── watchdog 自动 / POST /refresh
                    │  (0+ 个)     │
                    └──────────────┘

         同时：文件系统同步
         projects/<id>/{seq}_{name}/*.{pdf,docx,xlsx,jpg,...}
                                    │
                                    ▼ 转码
                  .pdfs/<seq>_<name>/*.pdf
```

## 7. API 详细契约

详见 SPEC.md §3。下面列出**最关键的 5 个端点**：

### 7.1 POST /api/projects

```json
请求：
{
  "name": "XX 高速 2024 路面工程",
  "handover_date": "2026-06-30",
  "deadline": "2026-07-15",
  "construction_unit": "XX 交投",
  "handover_person": "张三",
  "receiving_unit": "结算中心",
  "receiving_person": "李四"
}

响应 201：
{
  "id": "uuid",
  "name": "...",
  "status": "active",
  "progress": { "total": 25, "confirmed": 0, "uploaded": 0, "rejected": 0 },
  "created_at": "2026-06-09T16:30:00Z"
}
```

### 7.2 GET /api/projects/{id}/items

```json
响应 200：
{
  "project_id": "uuid",
  "items": [
    {
      "id": "uuid",
      "seq": 1,
      "name": "招标文件（含补充招标文件）",
      "description": "复印件加盖公章",
      "status": "uploaded",
      "files": [
        { "id": "uuid", "filename": "招标文件.pdf", "filesize": 1024000, "is_primary": true }
      ]
    },
    ...
  ],
  "unclaimed": [
    { "filename": "扫描件001.pdf", "original_path": "..." }
  ]
}
```

### 7.3 POST /api/items/{id}/confirm

```json
请求：{ "primary_file_id": "uuid" }   // 可选，不传则用第一个文件
响应 200：{ "status": "confirmed", "confirmed_at": "..." }
```

### 7.4 POST /api/projects/{id}/settlement/build

```json
响应 202：
{
  "job_id": "uuid",
  "status": "running",
  "started_at": "...",
  "poll_url": "/api/projects/{id}/settlement/status"
}
```

### 7.5 POST /api/projects/{id}/items （新增项 + 推广提示）

```json
请求：{ "name": "BIM 模型", "description": "..." }
响应 201：
{
  "id": "uuid",
  "seq": 26,
  "name": "BIM 模型",
  "is_extension": true,
  "promote_prompt": {
    "available": true,
    "message": "是否将此新增项加入标准模版？",
    "preview": { "name": "BIM 模型", "description": "..." }
  }
}
```

## 8. 前端组件树

```
App
├── Layout
│   ├── Sidebar
│   └── Topbar
├── Router
│   ├── ProjectList
│   │   ├── ProjectCard ×N
│   │   │   ├── ProgressRing
│   │   │   ├── DeadlineCountdown
│   │   │   └── StatusBadge
│   │   └── FilterBar
│   ├── ProjectNew
│   │   └── ProjectForm
│   ├── ProjectDetail
│   │   ├── ProjectHeader（截止倒计时）
│   │   ├── AddItemButton
│   │   ├── ItemList
│   │   │   └── ItemRow ×N
│   │   │       ├── StatusBadge
│   │   │       ├── FileList
│   │   │       └── ActionButtons
│   │   ├── UnclaimedFiles
│   │   └── BuildSettlementButton
│   ├── ProjectEdit
│   │   └── ProjectForm
│   ├── Settlement
│   │   ├── BuildProgress
│   │   └── DownloadButton
│   └── TemplateManager
│       └── TemplateItemList
└── ToastContainer
```

## 9. 配置（pydantic-settings）

```python
# backend/app/config.py
class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DB_PATH: str = "../data/settlement.db"
    PROJECTS_ROOT: str = "../projects"
    WPS_PATH: str | None = None  # 自动探测
    DEBOUNCE_SECONDS: float = 2.0
    WATCHDOG_FALLBACK_POLL: int = 5
    LAN_MODE: bool = True
    ACCESS_LOG: bool = True
    
    class Config:
        env_file = ".env"
```

## 10. 部署

### 10.1 开发模式

```bash
# 后端
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python scripts/bootstrap_template.py   # 一次性
python -m app.main

# 前端
cd frontend
npm install
npm run dev
```

### 10.2 生产模式（局域网）

```bash
# 后端
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1

# 前端
cd frontend
npm run build
# 用 nginx 或 python -m http.server 托管 dist/
```

### 10.3 启动脚本（顶层）

`scripts/start.bat`（Windows）：
```bat
@echo off
start "Backend" cmd /k "cd backend && .venv\Scripts\activate && python -m app.main"
start "Frontend" cmd /k "cd frontend && npm run dev"
echo 服务已启动
echo 后端: http://localhost:8000
echo 前端: http://localhost:5173
```

## 11. 测试策略

| 层级 | 工具 | 覆盖目标 |
|------|------|---------|
| 单元 | pytest | services / core |
| 集成 | pytest + httpx | routers + DB |
| 端到端 | vitest + Testing Library | 关键页面 |
| 手动 | 浏览器 | 完整流程（建→拖→复核→合并） |

**关键测试用例**（见 SPEC.md §11 验收剧本）：
- T1：建项目 + 25 项自动入库
- T2：拖文件到子文件夹 → 状态变 uploaded
- T3：拖文件到根目录 → 模糊匹配归属
- T4：复核 + 状态变 confirmed
- T5：驳回 + 备注
- T6：模版成长
- T7：合并生成结算书 + 封面 + 目录
- T8：截止日期紧急高亮

## 12. 风险落实

| SPEC 风险 | 落实位置 |
|----------|---------|
| WPS 不在 PATH | `core/wps_detector.py` 启动时探测 + 提示 |
| 局域网 IP 变动 | 启动时打印所有网卡 IP |
| 大文件转码慢 | BackgroundTasks 异步 + UI 进度 |
| 模版被误改 | master_template.json 入 git |
| Word 转 PDF 排版错位 | 转完用 `pypdf.PdfReader` 校验页数 |

---

> 等待用户确认 → 进入 ③.5 三文档对齐（team plan verifier 独立审计）
