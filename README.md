# 项目结算资料管理系统

> 把「项目结算资料交接清单」做成可执行的 Web 工具。
> 模版：用户提供 `项目结算资料交接清单.docx`（25 项标准资料，**不入库**，自行保管）
>
> 适合场景：施工/监理单位归档结算资料时，丢文件 → 自动归类 → 人工复核 → 一键合并 PDF 结算书。

---

## 1. 这套系统能做什么

1. **创建项目** → 系统自动从模版复制 **25 项标准资料**（如「招标文件」「施工合同」「验收报告」等），并在 `projects/<id>/` 下建好对应的子文件夹。
2. **丢文件** → 把 PDF / Word / Excel / 图片扔到对应子文件夹（或项目根目录），**3 秒内** Web 页面自动显示「已有」。
3. **在线预览** → 非 PDF 文件（docx/xlsx/txt/图片）在浏览器内直接打开预览，无需本地 Office；PDF 用内嵌 pdf.js 渲染。
4. **人工复核** → 逐项点「确认 / 驳回」，驳回可写说明。
5. **生成结算书** → 全 25 项都确认后，一键合并为单本 PDF（含封面 + 目录）。

核心特性：
- **文件监听**（watchdog）— 改文件、删文件都会被自动检测
- **局域网访问** — 后端默认 0.0.0.0:8000，路由器内同网段可访问
- **状态机** — `pending → uploaded → confirmed`（或 `rejected`）

---

## 2. 目录结构

```
项目结算资料管理/
├── 项目结算资料交接清单.docx   ← 25 项标准模版（**用户自有，不入库**）
├── README.md                    ← 本文件
├── CLAUDE.md                    ← 开发进度（给 AI 看的）
│
├── backend/                     ← Python 后端（FastAPI）
│   ├── app/                     ← 应用代码（不要手改）
│   ├── scripts/                 ← 一次性脚本（bootstrap / check_wps）
│   ├── tests/                   ← pytest 测试
│   ├── requirements.txt
│   └── .venv/                   ← Python 虚拟环境（bootstrap 后生成）
│
├── frontend/                    ← React 前端（Vite + TypeScript）
│   ├── src/                     ← 页面 + 组件
│   ├── package.json
│   └── node_modules/            ← npm install 后生成
│
├── data/                        ← 数据库 + 模版
│   ├── settlement.db            ← SQLite（自动生成）
│   └── master_template.json     ← 25 项标准模版（bootstrap 生成）
│
├── projects/                    ← 项目实例（用户资料存放处）
│   └── <project-id>/
│       ├── 招标文件/             ← 25 个子文件夹
│       ├── 中标通知书/
│       ├── ... (共 25 个)
│       └── .pdfs/               ← 转码后的 PDF
│
├── docs/                        ← 设计文档（README / SPEC / PLAN / CONTEXT）
│
└── scripts/                     ← 启动 / 引导脚本 ← 你在这里
    ├── bootstrap.bat / .sh      ← 首次运行：装环境
    └── start.bat / .sh          ← 日常：一键起服务
```

---

## 3. 快速开始（5 分钟）

### 3.1 前置依赖

| 工具 | 版本 | 用途 | 下载 |
|------|------|------|------|
| **Python** | 3.10+ | 后端 | <https://www.python.org/downloads/> |
| **Node.js** | 18+ | 前端 | <https://nodejs.org/> |
| **WPS Office** | 任意 | （可选）Word/Excel → PDF 转换 | <https://www.wps.cn/> |

> **WPS 不是必装** — 没装也能跑，所有文件都通过浏览器内嵌预览打开（docx 用 mammoth、xlsx 用 SheetJS、PDF 用 pdf.js）。

### 3.2 首次运行（Windows）

```cmd
# 1. 把整个项目目录解压到任意位置（不要放在带中文/空格的父目录里）
# 2. 双击运行 scripts\bootstrap.bat
#    它会做：建 venv → pip install → 解析 docx 模版 → npm install
# 3. 双击运行 scripts\start.bat
#    它会：开两个窗口分别起后端和前端
# 4. 浏览器打开 http://localhost:5173
```

### 3.3 首次运行（macOS / Linux）

```bash
# 1. 解压项目
# 2. 打开终端，cd 到项目根
cd /path/to/260609work2

# 3. 引导
bash scripts/bootstrap.sh

# 4. 启动
bash scripts/start.sh

# 5. 浏览器打开 http://localhost:5173
```

### 3.4 日常使用

启动后浏览器打开 `http://localhost:5173` 即可。每次关机后再次启动只需运行 `scripts/start.bat`（Windows）或 `bash scripts/start.sh`（Mac/Linux），**不需要再跑 bootstrap**。

---

## 4. 局域网访问

适用场景：办公室内多人协作（施工、监理、结算员共用一个项目）。

### 4.1 找本机 IP

启动后端时，控制台会打印一行：
```
局域网访问地址（任选其一）：
  http://192.168.1.100:8000
```

或自己查：
- **Windows**：`ipconfig`（找 `IPv4 地址`，如 `192.168.1.100`）
- **macOS / Linux**：`ifconfig` 或 `ip addr`（找 `inet 192.168.x.x`）

### 4.2 其他机器访问

1. **关闭 Windows 防火墙**（或放行 8000、5173 端口）：控制面板 → Windows Defender 防火墙 → 高级设置 → 入站规则 → 新建规则（端口 8000、5173，TCP，允许）
2. 确保同网段（同一个 WiFi / 路由器）
3. 同事浏览器打开 `http://<你的IP>:5173`
4. 前端会自动通过 `/api` 代理到后端的 8000 端口（同源访问无需配跨域）

> 注意：Vite 默认只监听 `localhost`，启动脚本已经加了 `--host 0.0.0.0` 让局域网可访问。

---

## 5. 文件预览

文件**无需提前转码** —— 浏览器内直接打开：

| 文件类型 | 前端组件 | 底层库 |
|----------|----------|--------|
| PDF | `<iframe>` 内嵌 | pdf.js |
| Word (docx) | HTML 转换渲染 | mammoth |
| Excel (xlsx) | HTML 表格渲染 | SheetJS (xlsx) |
| 图片 (jpg/png/gif/webp) | `<img>` | — |
| 文本 (txt/md/csv/json) | `<pre>` | — |
| 其他 | 下载提示 | — |

后端 `GET /api/files/{id}/preview` 自动设置 `Content-Disposition: inline` 让浏览器打开而非下载。

---

## 6. 常见问题（FAQ）

### Q1：双击 `start.bat` 闪退 / 立刻消失？
右键 → 编辑，把最后一行 `pause` 留着（脚本里已经写了），看错误信息。常见原因：
- Python 没装或没加 PATH → `python --version` 不出来
- 没跑 `bootstrap.bat` → 没有 `.venv` 目录

### Q2：端口 8000 / 5173 被占用？
- 8000（后端）：检查是否开了多个后端；或编辑 `backend/app/config.py` 改 `PORT=8001`
- 5173（前端）：编辑 `frontend/vite.config.ts` 改 `server.port`

### Q3：上传文件后页面不显示「已有」？
1. 看后端窗口日志，有没有 `[WATCHER] 处理失败`
2. 文件是否放到 `projects/<项目id>/` 下（或某个 25 个标准子文件夹里）
3. 文件名是否特殊（带 `~$` 临时文件被 .gitignore 排除）
4. 等 3 秒（watchdog 有 debounce）

### Q4：「生成结算书」按钮灰着？
必须 25 项都点「确认」才会启用。看页面顶部进度条，X / 25。

### Q5：合并后的 PDF 中文是方块？
`backend/app/services/settlement_builder.py` 用 `reportlab` 内置的 `STSong-Light` CID 字体（无需额外装字体）。如仍异常，参考 `docs/ALIGNMENT-3DOCS.md` 的字体回退方案。

### Q6：能不能用 MySQL 代替 SQLite？
不能。当前 SPEC 写死 SQLite（单文件、零配置、适合局域网小团队）。如需替换需改 `backend/app/database.py` + 重写迁移。

### Q7：怎么升级 / 改模版（增减项）？
1. 改 `项目结算资料交接清单.docx`（Word 里编辑 25 项）
2. 跑 `scripts/bootstrap.bat/sh` 重新生成 `data/master_template.json`
3. 重启后端

### Q8：想给某个项目加自定义项（不在 25 项标准里）？
Web 页面 → 项目详情 → 点「+ 自定义项」。新项默认只属于该项目，不会进全局模版（除非手动「推广到全局」）。

### Q9：数据存在哪？怎么备份？
- 数据库：`data/settlement.db`（项目元信息、状态、文件索引）
- 文件：`projects/<id>/**`（实际文件）
- 备份：直接复制 `data/` 和 `projects/` 两个目录即可

---

## 7. 进阶

### 7.1 跑测试

```bash
# 后端
cd backend
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux
pytest tests/ -v

# 前端
cd frontend
npm run test
```

### 7.2 开发模式（热重载）

```bash
# 后端
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 前端
cd frontend
npm run dev
```

### 7.3 重置数据

```bash
# Windows
del data\settlement.db
scripts\bootstrap.bat

# Mac/Linux
rm data/settlement.db
bash scripts/bootstrap.sh
```

---

## 8. 文档索引

| 文档 | 内容 |
|------|------|
| `docs/REQUIREMENT.md` | 需求 + 用户故事 |
| `docs/SPEC.md` | 规格 + API 契约 + Scenario |
| `docs/DESIGN.md` | 架构 + 数据模型 + 状态机 |
| `docs/PLAN.md` | 实施计划（文件归属） |
| `docs/CONTEXT-*.md` | 阶段决策摘要（开发进度） |
| `backend/README.md` | 后端开发说明 |
| `CLAUDE.md` | AI agent 协作进度 |

---

## 9. 许可 & 联系

本项目为内部工具。技术栈：FastAPI + React + SQLite + ReportLab（PDF 生成）+ mammoth / SheetJS / pdf.js（前端预览）。
