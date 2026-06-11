# 项目结算资料管理系统

> 把「项目结算资料交接清单」做成可执行的 Web 工具。
> 模版：用户提供 `项目结算资料交接清单.docx`（25 项标准资料，**不入库**，自行保管）
>
> 适合场景：施工/监理/造价单位归档结算资料时，丢文件 → 自动归类 → 人工复核 → 一键合并 PDF 结算书。
>
> **v0.3.0+ 推荐用 Docker 一键启动**（不用装 Python/Node，前后端在容器里跑）。

---

## 0. 30 秒快速开始（Docker 模式，**推荐**）

> 你装了 **Docker Desktop** 吗？没装去 https://www.docker.com/products/docker-desktop/ 下载。

```cmd
:: 1. 装好 Docker Desktop 并启动（系统托盘图标亮起）
:: 2. 双击 scripts\docker-up.bat
::    脚本自动：建数据目录 → 构建 backend/frontend 镜像 → 启动容器 → 打开浏览器
:: 3. 浏览器自动开 http://localhost:18080

:: 日常用：
scripts\docker-up.bat     :: 起服务
scripts\docker-down.bat   :: 停服务（数据保留）

:: 维护：
docker compose logs -f            :: 看日志
docker compose restart backend     :: 重启后端
docker compose down -v             :: 停 + 清数据（慎用）
```

> **Mac / Linux**：`bash scripts/docker-up.sh` 替代 `.bat`。
> 端口是 **18080**（前端）和 **18000**（后端），不是 80/8000 —— 故意挑了偏端口，避开常用端口冲突。
> 详细 Docker 部署见 §6。

> ⚠️ **安全警告（v0.3.0+）**：本系统**未加任何鉴权**（DELETE / POST / PATCH 等写接口）。
> 局域网内任何机器（甚至 curl / Postman / 恶意脚本）都能删除任意项目（含磁盘上 25 个子文件夹 + 结算书 PDF）。
> **只应在受信局域网使用**（如办公室内部网）。如需对外暴露：
> - **必须**加反向代理 + 鉴权（nginx basic auth / Cloudflare Tunnel / WireGuard VPN）
> - 或后续版本加 LAN token（已在 backlog）

---

## 1. 这套系统能做什么

1. **创建项目** → 系统自动从模版复制 **25 项标准资料**（如「招标文件」「施工合同」「验收报告」等），并在 `projects/<id>/` 下建好对应的子文件夹。
2. **选资料项**（v0.3.0+）→ 新建项目时**多选**模版项（**全选/全不选/反选/只选默认项**），或**临时添加本次项目用项**—— 每个项目要的项数都不同。
3. **丢文件** → 把 PDF / Word / Excel / 图片扔到对应子文件夹（或项目根目录），**3 秒内** Web 页面自动显示「已有」。
4. **在线预览**（v0.2.0+）→ 浏览器内嵌打开 docx / xlsx / pdf / 图片 / txt，**不依赖 WPS 客户端**。
5. **人工复核** → 逐项点「确认 / 驳回」，驳回可写说明。
6. **手动归档**（v0.3.0+）→ 25 项全部 confirmed 后，点「归档项目」按钮 → 项目只读、不可再编辑。
7. **生成结算书**（v0.3.0+）→ 一键合并为单本 PDF，**浏览器内直接预览** + 下载。
8. **删除项目**（v0.3.0+）→ 卡片右上角红垃圾桶，**需输入项目名二次确认**（防误删）。

核心特性：
- **文件监听**（watchdog）— 改文件、删文件都会被自动检测
- **局域网访问** — 后端默认 0.0.0.0:18000，路由器内同网段可访问
- **状态机** — `pending → uploaded → confirmed`（或 `rejected`），归档后只读
- **中文字体嵌入**（v0.3.0+）— 结算书 PDF 用宋体（uming）+ 黑体（ukai），中文不乱码

---

## 2. 目录结构

```
项目结算资料管理/
├── 项目结算资料交接清单.docx   ← 25 项标准模版（**用户自有，不入库**）
├── README.md                    ← 本文件
├── CLAUDE.md                    ← 开发进度（给 AI 看的）
│
├── backend/                     ← Python 后端（FastAPI）
│   ├── Dockerfile               ← python:3.11-slim + 中文字体 + tini
│   ├── app/                     ← 应用代码
│   │   ├── routers/             ← 5 个路由模块（projects / items / files / settlement / template）
│   │   ├── services/            ← 业务逻辑（watcher / settlement_builder / item_service / project_service / file_service）
│   │   ├── core/                ← 路径/字体/模版/路径工具
│   │   ├── models.py            ← SQLAlchemy ORM
│   │   ├── schemas.py           ← Pydantic（API 契约）
│   │   └── main.py              ← FastAPI 入口
│   ├── seeds/                   ← 占位模版（5 项，启动时初始化）
│   ├── tests/                   ← pytest 测试（112 用例）
│   ├── requirements.txt
│   └── scripts/                  ← 一次性脚本（bootstrap_template / check_wps）
│
├── frontend/                    ← React 前端（Vite + TypeScript）
│   ├── Dockerfile               ← 多阶段：node:22 build → nginx serve
│   ├── nginx.conf               ← 80 端口 + /api 反代 backend:18000
│   ├── src/
│   │   ├── pages/               ← 6 个页面（ProjectList/New/Detail/Edit/Settlement/TemplateManager）
│   │   ├── components/          ← 9 个组件（含 ProjectCard / FilePreviewModal / ConfirmModal）
│   │   ├── api/                 ← 6 个 API 模块
│   │   ├── hooks/               ← TanStack Query 包装
│   │   ├── lib/                 ← 工具（format / status / project-draft）
│   │   ├── store/               ← zustand 全局（toast + currentProjectId）
│   │   └── types/               ← TypeScript 契约
│   └── package.json
│
├── docs/                        ← 设计文档
│   ├── REQUIREMENT.md           ← 需求
│   ├── SPEC.md                  ← 规格 + API 契约
│   ├── DESIGN.md                ← 架构 + 数据模型
│   ├── PLAN.md                  ← 实施计划
│   ├── REVIEW-REQUEST-2026-06-11.md  ← v0.3.0 代码审查报告（3 个 track）
│   ├── REVIEW-TRACK1-OUTPUT.md  ← 审查 Track 1（代码质量）
│   ├── REVIEW-TRACK2-OUTPUT.md  ← 审查 Track 2（测试+安全+集成）
│   ├── REVIEW-TRACK3-OUTPUT.md  ← 审查 Track 3（架构+端到端）
│   └── screenshots/             ← 功能截图
│
├── data/                        ← 运行时生成（gitignore，不入库）
│   ├── settlement.db            ← SQLite
│   └── master_template.json     ← 25 项标准模版（首次启动从 docx 解析或挂载覆盖）
│
├── projects/                    ← 运行时生成（gitignore）
│   └── <project-id>/
│       ├── 01_招标文件/         ← 25 个子文件夹
│       ├── 02_中标通知书/
│       ├── ...
│       ├── _unclaimed/          ← 未归类文件
│       └── final/               ← 生成的结算书 PDF
│
├── docker-compose.yml           ← 一键编排（backend + frontend + 卷挂载）
└── scripts/
    ├── docker-up.bat / .sh      ← Windows / Mac-Linux 一键启动
    ├── docker-down.bat / .sh    ← 一键停止
    ├── bootstrap.bat / .sh      ← [开发模式] 首次环境初始化
    └── start.bat / .sh          ← [开发模式] 启动开发服务
```

---

## 3. 核心功能详解

### 3.1 新建项目（两步流程，v0.3.0+）

**第 1 步**：填项目基本信息（名称 / 移交日期 / 截止日期 / 移交方 / 接收方）
**第 2 步**：在独立全屏页选资料项

第 2 步可用的能力：

| 操作 | 行为 |
|------|------|
| **[全选]** | 一键勾上全部 25 项 |
| **[全不选]** | 取消所有勾选 → 创建空项目（项目下没有子文件夹） |
| **[反选]** | 勾上的变不勾，不勾的变勾上 |
| **[只选默认项]** | 保留标准交接清单的项，去除历史扩展项 |
| **[添加新项]** | 本次项目专用，**不写入全局模版**；如要长期保留请到「模版管理」页推广 |
| **移除临时项** | 临时项右侧 X 按钮 |

**草稿自动保存**（v0.3.0+）：第 1 步表单自动写 sessionStorage，**刷新或误关标签页能恢复**。顶部会出现琥珀色"检测到未完成的草稿"提示。

### 3.2 文件在线预览

把任意文件丢到子文件夹（或项目根目录），在文件列表点文件名，浏览器内嵌打开：

| 文件类型 | 渲染方式 | 底层库 |
|----------|----------|--------|
| PDF | `<iframe>` 内嵌 | pdf.js / 浏览器原生 |
| Word (docx) | 转 HTML 渲染 | mammoth.js |
| Excel (xlsx) | 转 HTML 表格 | SheetJS (xlsx) |
| 图片 (jpg/png/gif/webp/bmp/svg) | `<img>` | — |
| 文本 (txt/md/csv/json) | `<pre>` | — |
| 其他 | 提示「请下载后用本地应用打开」 | — |

后端 `GET /api/files/{id}/preview` 自动设 `Content-Disposition: inline`，浏览器**不下载直接预览**。

### 3.3 删除项目（v0.3.0+）

卡片右上角 **hover 出现红垃圾桶** → 弹窗要**输入项目名**才能激活「永久删除」按钮。

删除 = 硬删（DB 记录 + 磁盘 `projects/<id>/` 目录全部清空）。**不可撤销**。

### 3.4 手动归档（v0.3.0+）

**项目详情页** → "归档项目"按钮（仅 25 项全 confirmed 时可点）→ 弹窗要输"归档"才能确认。

归档后项目进入**只读**：
- 不可编辑元信息
- 不可驳回/确认/重置资料项
- 不可再次归档（已归档）
- 不可删除？—— 实际上**仍可删除**（如要硬清，删完即可）

> **判定**：25 项全 confirmed 才允许归档。0 项项目（`selected_template_seqs: []` 创建的）也允许归档（SPEC 待定，目前不卡）。

### 3.5 结算书生成 + 预览（v0.3.0+）

`结算书页`（/projects/:id/settlement）：
1. 加载时 GET `/preview` 检查 readiness
2. 全 confirmed → 「生成结算书」按钮 enabled
3. 点生成 → 后端合并 25 份 PDF + 封面（含中文字体嵌入）+ 目录
4. **「预览结算书」**（蓝色边按钮）→ 浏览器内嵌打开 PDF
5. **「下载结算书」**（绿色按钮）→ 浏览器下载 PDF 到本地

后端 `GET /api/projects/{id}/settlement/preview-pdf` 设 `Content-Disposition: inline` + 保留 `Content-Length`（修 nginx 反代缓冲问题）。

### 3.6 中文字体（v0.3.0+）

结算书 PDF 字体：
- **正文**：宋体替身 `uming`（fonts-arphic-uming 套件，TrueType）
- **标题**：黑体替身 `ukai`（fonts-arphic-ukai 套件，TrueType）
- **Windows 本地开发**：原版 SimSun + SimHei

启动日志会打 `[FONT] 结算书字体：正文=uming, 标题=ukai`（或开发机的 SimSun/SimHei）。

---

## 4. 局域网访问

适用场景：办公室内多人协作（施工、监理、造价员共用一个项目）。

### 4.1 找本机 IP

启动后端时，控制台会打印一行：
```
局域网访问地址（任选其一）：
  http://192.168.1.100:18000
```

或自己查：
- **Windows**：`ipconfig`（找 `IPv4 地址`，如 `192.168.1.100`）
- **macOS / Linux**：`ifconfig` 或 `ip addr`（找 `inet 192.168.x.x`）

### 4.2 其他机器访问

1. **关闭 Windows 防火墙**（或放行 18080 端口）：控制面板 → Windows Defender 防火墙 → 高级设置 → 入站规则 → 新建规则（端口 18080，TCP，允许）
2. 确保同网段（同一个 WiFi / 路由器）
3. 同事浏览器打开 `http://<你的IP>:18080`
4. 前端通过 nginx `/api` 反代到后端的 18000 端口（**同源**访问无需配跨域）

> Docker Desktop Windows 默认用 WSL2 后端，IP 通常是 WSL 虚拟网卡的。打开 cmd 跑 `ipconfig` 找 `WSL` 那块的 IP，或者直接用 `localhost`。

---

## 5. 常见问题（FAQ）

### Q1：`docker-up.bat` 闪退 / 立刻消失？
- 检查 Docker Desktop 是否启动（系统托盘图标应该亮起）
- 检查端口 18080/18000 是否被占用：`netstat -ano | findstr :18080`
- 看日志：`docker compose logs`

### Q2：端口 18080 / 18000 被占用？
- 编辑 `docker-compose.yml` 改端口映射（`"18080:80"` → `"28080:80"`）
- 同时 `frontend/nginx.conf` 不需要改（容器内端口仍是 80）

### Q3：上传文件后页面不显示「已有」？
- 等 3-5 秒（watchdog 监听 + APScheduler 兜底）
- 看后端日志：`docker compose logs backend | grep WATCHER`
- 检查文件是否在子文件夹（不是项目根）—— 项目根的文件需要"模糊匹配"到 item

### Q4：「生成结算书」按钮灰着？
- 必须 **25 项全部 confirmed**（不是 uploaded！）
- 看项目详情页底部统计：已确认 X/25

### Q5：合并后的 PDF 中文是方块 / 乱码？
- **开发模式（venv）**：检查 `C:\Windows\Fonts\simsun.ttc` 和 `simhei.ttf` 是否存在
- **Docker 模式**：检查容器内字体，启动时会打 `[FONT] 结算书字体：正文=uming, 标题=ukai`（如果回退到 STSong-Light / Helvetica-Bold 说明字体探测失败）
- 重启容器：`docker compose restart backend`

### Q6：能不能用 MySQL 代替 SQLite？
- 当前不支持。SQLite 适合 LAN 小工具（单写者，零运维）
- 切到 PG/MySQL 需要 alembic 迁移（**backlog**）

### Q7：怎么升级 / 改模版（增减项）？
- Web 页面 → 「模版管理」页 → 「添加新项」表单
- 临时项（项目详情页加的）可以"提升到全局"—— 暂未实现，需手动改 `data/master_template.json`

### Q8：误删了项目能恢复吗？
- **不能**。硬删 + 二次确认是为防止误删设计，**没有回收站**
- 预防：定期 `tar` 打包 `data/` + `projects/`

---

## 6. Docker 部署详解

### 6.1 端口

| 端口 | 服务 | 备注 |
|------|------|------|
| **18080** | 前端 nginx | **唯一对外端口**，浏览器访问 |
| 18000 | 后端 FastAPI | 通常不直连，由前端 nginx 转发 `/api` |

### 6.2 数据持久化

容器删除后数据不丢（**卷挂载**）：

```
宿主机                  →  容器内
./data/                →  /data      （SQLite + master_template.json）
./projects/            →  /projects  （25 子文件夹 + final/ 结算书）
```

### 6.3 镜像构建

```bash
docker compose build              # 构建全部
docker compose build backend      # 只重建后端（改 Python 代码后）
docker compose build frontend     # 只重建前端（改 React 代码后）
```

**镜像大小**（实测）：
- `settlement-backend:0.1.0`：~480 MB（python:3.11-slim + 中文字体 + reportlab）
- `settlement-frontend:0.1.0`：~50 MB（nginx + dist）

**首次构建** ~3-5 分钟（拉基础镜像 + 装依赖）；**改代码后**只重 build 当前服务 ~30s。

### 6.4 自定义 25 项模版

默认镜像内嵌 5 项占位模版。要用你那份完整的 25 项标准资料：

```cmd
mkdir seeds
copy E:\path\to\你的\完整master_template.json seeds\25.json
```

然后编辑 `docker-compose.yml`，取消下面这行注释：
```yaml
volumes:
  - ./seeds/25.json:/data/master_template.json:ro
```

下次 `docker compose up -d` 时，完整模版会覆盖占位版（**仅首次启动有效**；运行时直接改 `data/master_template.json` 同样生效）。

### 6.5 常用命令

```bash
docker compose up -d --build     # 构建并后台启动
docker compose logs -f           # 实时日志（Ctrl+C 退出）
docker compose logs -f backend   # 只看后端日志
docker compose ps                # 容器状态
docker compose restart backend   # 重启后端（配置变更后）
docker compose down              # 停止（保留数据）
docker compose down -v           # 停止 + 清空数据卷（慎用）
docker system prune -a           # 清理悬空镜像
```

### 6.6 健康检查

```bash
curl http://localhost:18000/api/health
# {"status":"ok","watcher":true,"watcher_mode":"watchdog","wps":false}
```

`watcher=false` 表示 watchdog 不可用，回退到 APScheduler 兜底（仍可用，只是 5s 轮询而非实时）。

### 6.7 文件结构（Docker 视角）

```
.
├── docker-compose.yml             # 编排（backend + frontend 两个 service）
├── backend/
│   ├── Dockerfile                 # python:3.11-slim + 中文字体 + tini
│   ├── requirements.txt
│   ├── app/                       # 业务代码
│   └── seeds/placeholder_template.json  # 5 项占位种子
├── frontend/
│   ├── Dockerfile                 # 多阶段：node:22 build → nginx serve
│   ├── nginx.conf                 # 80 端口 + /api 反代 backend:18000
│   └── src/                       # 业务代码
├── data/                          # 运行时生成
├── projects/                      # 运行时生成
└── scripts/
    ├── docker-up.bat / .sh        # 一键启动
    └── docker-down.bat / .sh      # 一键停止
```

---

## 7. 高级 / 开发模式（**不推荐日常使用**）

> 以下是 v0.3.0 之前的开发模式。如果你要改代码 / 跑测试，用这个；普通用户用 §0 的 Docker 模式即可。

### 7.1 前置依赖

| 工具 | 版本 | 用途 | 下载 |
|------|------|------|------|
| **Python** | 3.10+ | 后端 | <https://www.python.org/downloads/> |
| **Node.js** | 18+ | 前端 | <https://nodejs.org/> |
| **Docker Desktop** | 任意 | 容器化部署 | <https://www.docker.com/> |

### 7.2 首次运行

```cmd
:: 1. cd 到项目根
cd /d E:\trae-pc\260609work2

:: 2. 装环境
scripts\bootstrap.bat
::  行为：建 venv → pip install → 解析 docx 模版 → npm install

:: 3. 启服务（开两个窗口）
scripts\start.bat
::  后端：http://localhost:8000/api
::  前端：http://localhost:5173

:: 4. 浏览器打开 http://localhost:5173
```

> 开发模式端口 = 8000/5173（不是 18000/18080），是 v0.3.0 之前的默认值。

### 7.3 跑测试

```bash
# 后端
cd backend
python -m pytest             # 112 用例

# 前端
cd frontend
npx tsc -b                  # type check
npx vitest run              # 单元测试（61 用例）
```

### 7.4 重置数据

```bash
# 删除数据库（项目记录 + 文件元数据）
# Windows
del data\settlement.db
# Mac/Linux
rm data/settlement.db

# 重启会自动重建（用 seeds/placeholder_template.json 或 master_template.json）
```

### 7.5 字体（开发模式）

开发模式（Windows）后端自动注册系统字体：
- 正文：`C:\Windows\Fonts\simsun.ttc` → 字体名 `SimSun`
- 标题：`C:\Windows\Fonts\simhei.ttf` → 字体名 `SimHei`

启动日志会打 `[FONT] 结算书字体：正文=SimSun, 标题=SimHei`。

---

## 8. 文档索引

| 文档 | 内容 |
|------|------|
| `docs/REQUIREMENT.md` | 需求 + 用户故事 |
| `docs/SPEC.md` | 规格 + API 契约 + Scenario |
| `docs/DESIGN.md` | 架构 + 数据模型 + 状态机 |
| `docs/PLAN.md` | 实施计划（文件归属） |
| `docs/REVIEW-REQUEST-2026-06-11.md` | **v0.3.0 代码审查报告**（3 个 track 合并） |
| `docs/REVIEW-TRACK1-OUTPUT.md` | 审查 Track 1（代码质量） |
| `docs/REVIEW-TRACK2-OUTPUT.md` | 审查 Track 2（测试+安全+集成） |
| `docs/REVIEW-TRACK3-OUTPUT.md` | 审查 Track 3（架构+端到端） |
| `docs/screenshots/*.png` | 功能截图 |
| `backend/README.md` | 后端开发说明 |
| `CLAUDE.md` | AI agent 协作进度 |

---

## 9. 版本历史

| 版本 | 关键变更 | commit |
|------|---------|--------|
| **v0.3.0** | 端口 18080/18000 + 删除项目（硬删+二次确认）+ 手动归档（按钮）+ 结算书预览（inline）+ 模板多选（前后端 2 步流程）+ sessionStorage 草稿 + 13 项代码审查修复（字体/契约/watcher 等） | `7e180e5` |
| v0.2.0 | docker 化 + 文件预览（mammoth/SheetJS/pdf.js） | `6eb5d00` |
| v0.1.0 | 初版（FastAPI + React + SQLite + 25 项模版） | — |

---

## 10. 许可 & 联系

本项目为内部工具。技术栈：**FastAPI + React + SQLite + ReportLab**（PDF 生成）+ **mammoth / SheetJS / pdf.js**（前端预览）+ **fonts-arphic-uming/ukai**（中文字体）。

> 已知 backlog（v0.3.0 之后）：
> - **DELETE 鉴权升级**（当前只 README warning）
> - **alembic 数据库迁移机制**（当前 `create_all`）
> - **settlement 异步化**（当前单 worker 同步生成，大 PDF 60s+ 期间全用户卡死）
