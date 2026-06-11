# PLAN — 项目结算资料管理系统

> 阶段：④ 计划（dev-pipeline-mavis）
> 编排者：Mavis
> 日期：2026-06-09
> 关联：REQUIREMENT v1.0、SPEC v1.0、DESIGN v1.0、ALIGNMENT-3DOCS v1.0

---

## 1. 总览

### 1.1 工作量估计

| 模块 | 文件数 | 估计行数 | 状态 |
|------|--------|---------|------|
| 后端（FastAPI） | 18 | ~1100 | ✅ 已写（⓪.b 阶段超前完成） |
| 后端测试（pytest） | 6 | ~400 | 🔴 待写 |
| 前端（React + Vite） | 28 | ~1600 | 🔴 待写 |
| 前端测试（vitest） | 4 | ~250 | 🔴 待写 |
| 启动脚本 + 文档 | 4 | ~150 | 🟡 部分 |
| **合计** | **60** | **~3500** | **完成度 ~40%** |

### 1.2 任务编号

- **T-BE-** 后端编码（已完成 18/18）
- **T-BE-T-** 后端测试
- **T-FE-** 前端编码
- **T-FE-T-** 前端测试
- **T-OPS-** 启动脚本 + 文档
- **T-VRF-** 验证任务（⑥.5 / ⑦ / ⑧）

## 2. 已完成（⓪.b 阶段超前完成 — 经 ③.5 审计通过）

### 2.1 后端骨架

| 文件 | 行数 | 职责 |
|------|------|------|
| `backend/requirements.txt` | 16 | 依赖清单 |
| `backend/README.md` | 20 | 后端说明 |
| `backend/app/__init__.py` | 2 | 包标识 |
| `backend/app/config.py` | 35 | pydantic-settings 配置 |
| `backend/app/database.py` | 22 | SQLAlchemy engine + session |
| `backend/app/models.py` | 87 | 5 张表 ORM |
| `backend/app/schemas.py` | 137 | 14 个 Pydantic schema |
| `backend/app/main.py` | 130 | FastAPI 入口 + lifespan |
| `backend/app/core/__init__.py` | 1 | |
| `backend/app/core/template_loader.py` | 65 | 解析 docx 模版 |
| `backend/app/core/matching.py` | 51 | 文件名模糊匹配 |
| `backend/app/core/paths.py` | 51 | 路径安全工具 |
| `backend/app/services/__init__.py` | 1 | |
| `backend/app/services/project_service.py` | 95 | 项目 CRUD + 文件夹创建 |
| `backend/app/services/item_service.py` | 130 | Item 状态机 |
| `backend/app/services/file_service.py` | 105 | 文件归属 + 入库 |
| `backend/app/services/watcher_service.py` | 86 | watchdog 封装 |
| `backend/app/services/pdf_converter.py` | 56 | WPS CLI 封装 |
| `backend/app/services/settlement_builder.py` | 200 | 封面 + 目录 + 合并 |
| `backend/app/routers/__init__.py` | 1 | |
| `backend/app/routers/projects.py` | 80 | /api/projects |
| `backend/app/routers/items.py` | 105 | /api/items |
| `backend/app/routers/files.py` | 80 | /api/files |
| `backend/app/routers/template.py` | 30 | /api/template |
| `backend/app/routers/settlement.py` | 85 | /api/settlement |
| `backend/scripts/bootstrap_template.py` | 50 | 解析 docx → JSON |
| `backend/scripts/check_wps.py` | 55 | 探测 WPS CLI |
| `data/master_template.json` | (生成) | 25 项标准模版 |

**验证记录**：
- ✅ `python scripts/bootstrap_template.py` 成功生成 master_template.json（25 项）
- ✅ `python -c "from app.main import app; print('OK')"` 加载成功
- ✅ 30 个路由全部注册
- ⚠️ 启动时 lifespan 报 `WPS_PATH` 配置缺失（已修，代码已更新）

## 3. 待写：⑥ 编码阶段任务

### 3.1 拆分原则

- **后端**（已完成，不再分工）
- **前端**：拆 3 个 worker 并行
  - **T-FE-A**：API 客户端 + 项目列表 + 新建项目
  - **T-FE-B**：项目详情 + 资料项 + 文件列表 + 操作按钮
  - **T-FE-C**：结算书 + 模版管理 + 通用组件
- **后端测试**：1 个 worker（T-BE-T）
- **前端测试**：1 个 worker（T-FE-T）
- **运维**：1 个 worker（T-OPS）

### 3.2 T-FE-A：API 客户端 + 项目列表 + 新建

| 文件 | 职责 | 依赖 |
|------|------|------|
| `frontend/package.json` | 依赖 + scripts | - |
| `frontend/vite.config.ts` | Vite 配置 + 代理 | - |
| `frontend/tsconfig.json` | TS 配置 | - |
| `frontend/tailwind.config.js` | Tailwind 配置 | - |
| `frontend/postcss.config.js` | PostCSS | - |
| `frontend/index.html` | 入口 HTML | - |
| `frontend/src/main.tsx` | React 入口 | T-FE-A-1 |
| `frontend/src/App.tsx` | 路由 | T-FE-A-2 |
| `frontend/src/index.css` | Tailwind 指令 | T-FE-A-3 |
| `frontend/src/vite-env.d.ts` | 类型 | T-FE-A-4 |
| `frontend/src/api/client.ts` | axios 封装 | T-FE-A-5 |
| `frontend/src/api/projects.ts` | 项目 API | T-FE-A-6 |
| `frontend/src/api/template.ts` | 模版 API | T-FE-A-7 |
| `frontend/src/pages/ProjectList.tsx` | 项目列表 | T-FE-A-8 |
| `frontend/src/pages/ProjectNew.tsx` | 新建项目表单 | T-FE-A-9 |
| `frontend/src/hooks/useProjects.ts` | 项目数据 hook | T-FE-A-10 |
| `frontend/src/lib/format.ts` | 日期/文件大小 | T-FE-A-11 |
| `frontend/src/lib/status.ts` | 状态颜色/图标 | T-FE-A-12 |

### 3.3 T-FE-B：项目详情 + 资料项 + 文件

| 文件 | 职责 | 依赖 |
|------|------|------|
| `frontend/src/api/items.ts` | 资料项 API | - |
| `frontend/src/api/files.ts` | 文件 API | - |
| `frontend/src/pages/ProjectDetail.tsx` | 项目详情主页面 | T-FE-B-1 |
| `frontend/src/pages/ProjectEdit.tsx` | 编辑项目 | T-FE-B-2 |
| `frontend/src/components/ItemRow.tsx` | 单行资料项 | T-FE-B-3 |
| `frontend/src/components/FileList.tsx` | 文件列表 | T-FE-B-4 |
| `frontend/src/components/StatusBadge.tsx` | 状态徽章 | T-FE-B-5 |
| `frontend/src/components/UnclaimedFiles.tsx` | 未认领文件 | T-FE-B-6 |
| `frontend/src/hooks/useItems.ts` | 资料项 hook | T-FE-B-7 |
| `frontend/src/hooks/useDeadlineStatus.ts` | 倒计时 | T-FE-B-8 |

### 3.4 T-FE-C：结算书 + 模版 + 通用组件

| 文件 | 职责 | 依赖 |
|------|------|------|
| `frontend/src/api/settlement.ts` | 结算书 API | - |
| `frontend/src/pages/Settlement.tsx` | 结算书页 | T-FE-C-1 |
| `frontend/src/pages/TemplateManager.tsx` | 模版管理页 | T-FE-C-2 |
| `frontend/src/components/Layout.tsx` | 布局 + Sidebar | T-FE-C-3 |
| `frontend/src/components/ProjectCard.tsx` | 项目卡片 | T-FE-C-4 |
| `frontend/src/components/ProgressRing.tsx` | 进度环 | T-FE-C-5 |
| `frontend/src/components/DeadlineCountdown.tsx` | 倒计时显示 | T-FE-C-6 |
| `frontend/src/store/app.ts` | zustand store | T-FE-C-7 |
| `frontend/src/types/index.ts` | 共享类型 | T-FE-C-8 |

### 3.5 T-BE-T：后端测试

| 文件 | 覆盖 |
|------|------|
| `backend/tests/conftest.py` | 测试夹具（临时目录、TestClient） |
| `backend/tests/test_projects.py` | 项目 CRUD + 创建文件夹 |
| `backend/tests/test_items.py` | 状态机 + 增删改 |
| `backend/tests/test_files.py` | 文件归属 + 匹配 |
| `backend/tests/test_matching.py` | matching 单元测试 |
| `backend/tests/test_settlement.py` | 结算书生成 |

### 3.6 T-FE-T：前端测试

| 文件 | 覆盖 |
|------|------|
| `frontend/src/lib/format.test.ts` | 日期/文件大小 |
| `frontend/src/lib/status.test.ts` | 状态颜色 |
| `frontend/src/components/StatusBadge.test.tsx` | 徽章组件 |
| `frontend/src/components/ItemRow.test.tsx` | ItemRow 交互 |

### 3.7 T-OPS：启动脚本 + 文档

| 文件 | 职责 |
|------|------|
| `scripts/start.bat` | Windows 一键启动 |
| `scripts/start.sh` | Linux/Mac 一键启动 |
| `scripts/bootstrap.bat` | 首次运行（venv + pip + bootstrap） |
| `scripts/bootstrap.sh` | 同上 shell 版 |
| `README.md` | 顶层使用说明（更新） |
| `docs/CONTEXT-01-requirements.md` | 阶段决策摘要 |
| `docs/CONTEXT-02-spec.md` | 阶段决策摘要 |
| `docs/CONTEXT-03-design.md` | 阶段决策摘要 |

## 4. ⑥ 团队并行方案

按 DESIGN §3 的目录结构和上面 3.2-3.4 的拆分，并行 3 个 worker：

```
worker-A: T-FE-A（17 个文件）
worker-B: T-FE-B（10 个文件）
worker-C: T-FE-C（10 个文件）

sequentially after ⑥: T-BE-T + T-FE-T + T-OPS（独立不冲突）
```

**集成时序**：
1. ⑥ 三 worker 并行 ~10 分钟
2. ⑥.5 verifier 检查：API 契约、路由可达、前后端联通
3. ⑦ 测试：pytest + vitest + 手动浏览器测试
4. ⑧ 审查：diff review
5. ⑨ 修复：按 review 改
6. ⑩ 交付：merge + DELIVERY.md
7. ⑪ 通知

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 并行 worker 之间 import 路径冲突 | 拆分按页面/组件隔离，几乎无交叉 |
| TypeScript 类型与后端 Pydantic 漂移 | 共享 types/index.ts 作为契约（手写，未来可 codegen） |
| 前端 axios 路径前缀 | vite.config.ts 配 /api 代理到 8000 |
| 中文 PDF 字体失败 | 用 reportlab 内置 STSong-Light（CID 字体） |
| WPS CLI 调用阻塞 | 同步调用（< 60 秒/文件），UI 显示 loading |

## 6. 验收清单（Definition of Done for ⑥）

- [ ] ⑥ 完成
- [ ] ⑥.5 集成验证 PASS
- [ ] pytest 全绿
- [ ] vitest 全绿
- [ ] 浏览器手动测试 4 个剧本（SPEC §11）通过
- [ ] 启动脚本能起服务
- [ ] 局域网另一台机器可访问

---

> 进入 ⑤ ALIGNMENT 自检（6 维度）→ ⑥ 编码（team plan）
