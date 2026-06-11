# CONTEXT-04 — ⑥ 编码阶段上下文

> 阶段：④ → ⑥ 衔接
> 编排者：Mavis
> 日期：2026-06-09
> 关联：PLAN.md v1.0

---

## 1. 团队拆分

按文件归属（不重叠）拆 5 个 worker：

| Worker ID | 任务 | 文件数 | 依赖 |
|-----------|------|--------|------|
| `coder-frontend-a` | T-FE-A：API 客户端 + 项目列表/新建 | 17 | 后端 30 路由已注册 |
| `coder-frontend-b` | T-FE-B：项目详情 + 资料项 + 文件 | 10 | T-FE-A 的 types/index.ts（共享） |
| `coder-frontend-c` | T-FE-C：结算书 + 模版 + 通用组件 | 10 | T-FE-A 的 types/index.ts |
| `coder-backend-tests` | T-BE-T：pytest 测试 | 6 | 后端代码已写完 |
| `coder-ops` | T-OPS：启动脚本 + 文档 | 6 | 无 |

## 2. 接口契约（前后端必须一致）

### 2.1 端点清单

| Method | Path | 后端文件 | 前端调用方 |
|--------|------|---------|----------|
| GET | `/api/projects` | routers/projects.py | T-FE-A |
| POST | `/api/projects` | routers/projects.py | T-FE-A |
| GET | `/api/projects/{id}` | routers/projects.py | T-FE-B |
| PATCH | `/api/projects/{id}` | routers/projects.py | T-FE-B |
| POST | `/api/projects/{id}/archive` | routers/projects.py | T-FE-B |
| DELETE | `/api/projects/{id}` | routers/projects.py | T-FE-B |
| GET | `/api/projects/{id}/items` | routers/items.py | T-FE-B |
| POST | `/api/projects/{id}/items` | routers/items.py | T-FE-B |
| PATCH | `/api/items/{id}` | routers/items.py | T-FE-B |
| DELETE | `/api/items/{id}` | routers/items.py | T-FE-B |
| POST | `/api/items/{id}/confirm` | routers/items.py | T-FE-B |
| POST | `/api/items/{id}/reject` | routers/items.py | T-FE-B |
| POST | `/api/items/{id}/reset` | routers/items.py | T-FE-B |
| GET | `/api/items/{id}/files` | routers/files.py | T-FE-B |
| POST | `/api/items/{id}/refresh` | routers/files.py | T-FE-B |
| GET | `/api/files/{id}/preview` | routers/files.py | T-FE-B |
| GET | `/api/files/{id}/download` | routers/files.py | T-FE-B |
| DELETE | `/api/files/{id}` | routers/files.py | T-FE-B |
| GET | `/api/template` | routers/template.py | T-FE-C |
| POST | `/api/template/items` | routers/template.py | T-FE-C |
| GET | `/api/projects/{id}/settlement/preview` | routers/settlement.py | T-FE-C |
| GET | `/api/projects/{id}/settlement/status` | routers/settlement.py | T-FE-C |
| POST | `/api/projects/{id}/settlement/build` | routers/settlement.py | T-FE-C |
| GET | `/api/projects/{id}/settlement/download` | routers/settlement.py | T-FE-C |

### 2.2 关键类型契约

`frontend/src/types/index.ts`（T-FE-A 写，T-FE-B/C 引用）：

```typescript
export type ItemStatus = 'pending' | 'uploaded' | 'confirmed' | 'rejected';
export type ProjectStatus = 'active' | 'archived';

export interface ProjectProgress {
  total: number;
  confirmed: number;
  uploaded: number;
  rejected: number;
  pending: number;
}

export interface Project {
  id: string;
  name: string;
  handover_date: string | null;
  deadline: string;
  construction_unit: string | null;
  handover_person: string | null;
  receiving_unit: string | null;
  receiving_person: string | null;
  status: ProjectStatus;
  created_at: string;
  progress: ProjectProgress;
  days_to_deadline: number;
}

export interface FileInfo {
  id: string;
  filename: string;
  filesize: number;
  is_pdf: boolean;
  is_primary: boolean;
  uploaded_at: string;
}

export interface Item {
  id: string;
  seq: number;
  name: string;
  description: string | null;
  pages: number | null;
  status: ItemStatus;
  rejected_note: string | null;
  confirmed_at: string | null;
  is_extension: boolean;
  files: FileInfo[];
}

export interface ItemListResponse {
  project_id: string;
  items: Item[];
  unclaimed: FileInfo[];
}

export interface TemplateItem {
  seq: number;
  name: string;
  description: string | null;
  is_default: boolean;
}

export interface Template {
  version: number;
  items: TemplateItem[];
}

export interface SettlementJob {
  job_id: string;
  status: 'running' | 'success' | 'failed';
  started_at: string;
  finished_at: string | null;
  output_path: string | null;
  file_size: number | null;
  error: string | null;
}
```

## 3. 状态颜色契约

`frontend/src/lib/status.ts`（T-FE-A 写）：

| status | color | icon | label |
|--------|-------|------|-------|
| pending | gray-400 | ⚪ | 未开始 |
| uploaded | blue-500 | 📄 | 已上传 |
| confirmed | green-500 | ✅ | 已确认 |
| rejected | red-500 | ❌ | 已驳回 |

## 4. 路由契约（前端）

```
/                            → ProjectList
/projects/new                → ProjectNew
/projects/:id                → ProjectDetail
/projects/:id/edit           → ProjectEdit
/projects/:id/settlement     → Settlement
/template                    → TemplateManager
```

## 5. 启动方式

- 后端：`cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && python scripts/bootstrap_template.py && python -m app.main`
- 前端：`cd frontend && npm install && npm run dev`
- Vite 代理 `/api` → `http://127.0.0.1:8000`

## 6. 完成条件（每个 worker 必做）

1. 所有分配文件已写入 `<PROJECT_ROOT>/frontend/` 或 `<PROJECT_ROOT>/backend/tests/` 或 `<PROJECT_ROOT>/scripts/`
2. 前端：`npm run build` 通过；后端：`python -m compileall` 通过
3. 写 `docs/CONTEXT-06-TXXX.md` 简述：实现摘要 + 已知问题
4. `git add <你的文件> && git commit -m "[编码] T-XXX <模块名>"`

## 7. 禁止事项

- ❌ 禁止修改他人负责的文件路径
- ❌ 禁止跳过对应 Scenario 验证
- ❌ 禁止改动 PLAN.md / DESIGN.md / SPEC.md / REQUIREMENT.md
- ❌ 禁止改动已写完的后端代码（除非有 blocker，且在 CONTEXT-06 标注）
