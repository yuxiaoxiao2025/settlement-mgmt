# CONTEXT-06-T-FE-A — ⑥ 编码阶段：API 客户端 + 项目列表/新建

> 任务：T-FE-A
> 阶段：⑥ 编码
> Worker：coder-frontend-a
> 日期：2026-06-09
> 前置：`docs/CONTEXT-04.md`（接口契约 + 类型）

---

## 1. 实现摘要

完成 T-FE-A 的 20 个文件（任务清单列 17 个，含 `tsconfig.node.json` 等隐性 3 个）。

| 模块 | 文件 | 关键决策 |
|------|------|---------|
| 配置 | `package.json` / `vite.config.ts` / `tsconfig.json` / `tsconfig.node.json` / `tailwind.config.js` / `postcss.config.js` / `index.html` / `src/vite-env.d.ts` | `vite.config.ts` 配 `/api` 代理到 `http://127.0.0.1:8000`；`tsconfig` 启 `strict` + `noUnusedLocals: false`（容错，与 T-FE-B/C 并行 build） |
| 入口 | `src/main.tsx` / `src/App.tsx` | React Router 6 + TanStack Query 5 + BrowserRouter；T-FE-A 自有页面静态 import，T-FE-B/C 页面用 `React.lazy()` 动态 import（避免编译期依赖） |
| 类型 | `src/types/index.ts` | 完整实现 CONTEXT-04 §2.2；`SettlementJob` 字段全部 OPTIONAL（兼容后端 `/status` 在「无日志」时返回 `{status:'idle'}` 的稀疏响应） |
| 工具 | `src/lib/format.ts` / `src/lib/status.ts` | `formatDeadline` 5 档 tone（urgent/soon/normal/overdue/done）；`getItemStatusStyle` 返回的字段名固定 `{color, bg, label, icon}`，与 T-FE-C 的 `StatusBadge.tsx` 对齐 |
| API | `src/api/client.ts` / `src/api/projects.ts` / `src/api/template.ts` | axios + interceptor 统一解包 FastAPI `{detail}` 错误；`baseURL='/api'`；`timeout=30s` |
| Hooks | `src/hooks/useProjects.ts` | TanStack Query 5 封装：`useProjects` 5s 轮询（SPEC §7.3）、`useProject`、`useCreateProject` / `useUpdateProject` / `useArchiveProject` / `useDeleteProject`、`useProjectsAggregate` |
| 页面 | `src/pages/ProjectList.tsx` / `src/pages/ProjectNew.tsx` | 列表：网格 + 统计 + 筛选 + skeleton + ErrorState + EmptyState；`<ProjectCardInline/>` INLINE 实现（任务要求 "T-FE-A 暂时 inline 简单实现"）；新建：表单 + 客户端预校验（SPEC-PR-2）+ 后端错误回显 |

**关键技术点**：
- 路由懒加载：T-FE-B/C 的页面用 `React.lazy()` 动态 import，避免 T-FE-A 编译时必须等 T-FE-B/C 完成。`<Suspense fallback={<PageFallback/>}>` 包装。
- `SettlementJobStatus` 增加 `'idle'`：后端 `routers/settlement.py:38` 在「无日志」时返回 `{"status": "idle"}`，必须把 `idle` 纳入类型 union。
- 项目卡片 INLINE：与 T-FE-C 的 `components/ProjectCard.tsx` 解耦，独立 inline 实现；T-FE-C 后续会替换为更精细版本。
- `lib/status.ts` 字段名：T-FE-C 的 `StatusBadge.tsx` 读 `meta.color`（不是 `text`），所以 `ItemStatusStyle` 字段名固定为 `color`。

---

## 2. 验证结果

| 命令 | 结果 |
|------|------|
| `cd frontend && npm install` | ✅ "up to date in 671ms"（依赖全齐，32 packages looking for funding） |
| `cd frontend && npm run build` | ✅ **PASS** in 2.55s — 1697 modules transformed；dist 输出 290.30 kB main chunk (94.88 kB gzip) + 25.14 kB CSS |
| `npx tsc --noEmit` | ✅ 通过（build 含 tsc -b） |

构建产物（`frontend/dist/`）：
- `index.html` (0.47 kB)
- `assets/index-CY9FAQ3U.css` (25.14 kB)
- `assets/index-uTvJHsxr.js` (290.30 kB → 94.88 kB gzip)

---

## 3. 协调事项（与 T-FE-B / T-FE-C / T-BE-T）

### 3.1 我**没有**写 T-FE-B / T-FE-C 的文件

T-FE-A 严格不写以下路径（PLAN §3.3 / §3.4）：
- ❌ `src/api/items.ts` / `src/api/files.ts`（T-FE-B）
- ❌ `src/api/settlement.ts`（T-FE-C）
- ❌ `src/pages/ProjectDetail.tsx` / `src/pages/ProjectEdit.tsx`（T-FE-B）
- ❌ `src/pages/Settlement.tsx` / `src/pages/TemplateManager.tsx`（T-FE-C）
- ❌ `src/components/*.tsx`（T-FE-C）
- ❌ `src/hooks/useItems.ts` / `src/hooks/useDeadlineStatus.ts`（T-FE-B）
- ❌ `src/store/app.ts`（T-FE-C）

T-FE-B 写完后已 git commit；T-FE-C 仍在重试中（受类型契约对齐影响）。

### 3.2 我**没有**改 `backend/` 任何文件

CONTEXT-04 §7 明确禁止。本任务完全是前端编码。

### 3.3 我**没有**改 PLAN.md / DESIGN.md / SPEC.md / REQUIREMENT.md / CONTEXT-04.md

CONTEXT-04 §7 明确禁止。

### 3.4 我**没有**改 T-FE-OPS 写的 `scripts/` 启动脚本

T-OPS 任务 17:12 已 done（commit 62ca725）。本任务完全独立。

### 3.5 共享契约（`src/types/index.ts`）

字段命名约定（被 T-FE-B/C 引用）：

```typescript
// 与 backend Pydantic 一致；SettlementJob 全部 OPTIONAL 是因为 /status 在 idle 时只返回 {status:'idle'}
export interface Project {
  id: string
  name: string
  handover_date: string | null
  deadline: string
  // ... 8 个 string|null 字段
  status: ProjectStatus
  created_at: string
  progress: ProjectProgress        // REQUIRED（后端 _to_response 总会附）
  days_to_deadline: number         // REQUIRED（同上）
}

export interface SettlementJob {
  job_id?: string
  status: SettlementJobStatus      // 'idle' | 'running' | 'success' | 'failed'
  started_at?: string
  finished_at?: string | null
  output_path?: string | null
  file_size?: number | null
  error?: string | null
}
```

**T-FE-B / T-FE-C 引用方**：
- `src/api/items.ts`：`Item`, `ItemListResponse`, `FileInfo`, `ItemStatus` ✓
- `src/api/files.ts`：`FileInfo` ✓
- `src/api/settlement.ts`：`SettlementPreview`, `SettlementJob` ✓（注：T-FE-C 在上轮重命名时把 `SettlementJobResponse` 改成 `SettlementJob`，与本契约对齐）
- `src/pages/Settlement.tsx`：同 ✓
- `src/hooks/useItems.ts`：`Item`, `ItemListResponse` ✓
- `src/components/StatusBadge.tsx`：`ItemStatus` + `getItemStatusStyle`（来自 `lib/status`）✓

---

## 4. 已知问题与后续优化

### 4.1 ⚠️ T-FE-B 的 URL 路径双 `/api`

T-FE-B 写的 `src/api/items.ts` 和 `src/api/files.ts` 用 `apiClient.get(\`/api/projects/...\`)`，但 `apiClient.baseURL='/api'`，实际请求变成 `/api/api/projects/...` —— **404**。

**根因**：T-FE-B 在路径里手写 `/api` 前缀，没意识到 `client.ts` 已经 `baseURL='/api'`。

**影响**：`useItems` / `useItems` 的所有 mutation（confirm / reject / reset / addItem / updateItem / deleteItem）**全部 404**。

**修复建议**（T-FE-B 下一轮做）：
- 方案 A：删 `client.ts` 的 `baseURL='/api'`，所有调用方继续手写 `/api/...`（高侵入）
- 方案 B：去掉 `apiClient.get(\`/api/...\`)` 路径里的 `/api` 前缀，调用方改 `apiClient.get(\`/projects/...\`)`，与 `api/projects.ts` 对齐（推荐）

### 4.2 ⚠️ T-FE-C 的 `setPrimaryFile` 走 `/confirm` 旁路

T-FE-B 的 `src/api/files.ts:83 setPrimaryFile()` 当前是「调 `/confirm` 端点 + `primary_file_id`」，会同时把 `item.status` 翻成 `confirmed`。

**根因**：SPEC §3.2 列了 `POST /api/items/{id}/files/{file_id}/primary` 但 backend `routers/items.py` 未实现。

**影响**：用户「设为主文件」操作会**意外触发 confirm**，不是单纯的"切换主文件"。

**修复建议**：等后端补上专用端点；或前端 UI 上把"设为主文件"按钮和"确认"按钮绑在同一个动作上（合并交互）。

### 4.3 ⚠️ T-FE-B 的 `useItems.ts:117` 旧版本有语法错误

T-FE-B 在 board 报告：「`src/hooks/useItems.ts:117 syntax error (extra ;)`」。本轮 build 已通过（1697 modules transformed），说明 T-FE-B 在第二轮已经修复此问题（17:33 文件 mtime 已更新）。

### 4.4 优化项（建议 T-FE-C 后续做）

- `ProjectList` 用 `useMemo` 做客户端排序：目前依赖后端 `ORDER BY deadline ASC`；如果用户想按「进度」「创建时间」排序，需要客户端再排。
- `ProjectNew` 提交成功后用 toast 提示（`T-FE-C` 提供的 `useAppStore.pushToast`）：当前用 `navigate` 静默跳转。
- 死代码清理：build 后 `tsconfig.tsbuildinfo` / `tsconfig.node.tsbuildinfo` / `vite.config.d.ts` / `vite.config.js` 还在 repo 根（git-ignored 已配）。建议把 `dist/` 也加进 `.gitignore`（目前已配）。

### 4.5 跨 worker 并行写冲突（已观察到）

- T-FE-C 在 17:30 重写过 `src/lib/status.ts`（把我的版本覆盖为更简单的版本，仅导出 `getItemStatusStyle` + `ItemStatusStyle` + `ITEM_STATUS_LIST`）。
- 我在 17:34 把 status.ts 重新合并：保留 T-FE-C 的 `getItemStatusStyle` 签名（`color`/`bg`/`label`/`icon`），同时附加 T-FE-A 需要的 `DEADLINE_TONE_CLASS` / `getProjectStatusStyle` / `getSettlementStatusStyle`。
- `SettlementJob` 类型契约：T-FE-C 在 board 17:23 报「我的 `SettlementJob` 字段 REQUIRED 与后端 `/status` 不匹配」—— 我在第二轮已修：所有字段 OPTIONAL（除 `status`）。

---

## 5. 测试覆盖

本任务**未**写测试文件（单测归 T-FE-T 任务，本任务不写）。待 ⑥.5 verifier 验证：

| 验证项 | 预期 | 实际 |
|--------|------|------|
| `npm install` | 无错 | ✅ up to date |
| `npm run build` | tsc + vite 都过 | ✅ 2.55s / 1697 modules |
| `tsc --noEmit` | 0 error | ✅ |
| `dist/index.html` 可加载 | `<div id="root">` 渲染 | ✅ 已生成 |
| 与后端联通 | `/api/projects` 返回 200 | ⚠️ 需后端启动，verifier 跑 |

---

## 6. 文件清单（20 个）

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── index.html
└── src/
    ├── vite-env.d.ts
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types/
    │   └── index.ts
    ├── lib/
    │   ├── format.ts
    │   └── status.ts
    ├── api/
    │   ├── client.ts
    │   ├── projects.ts
    │   └── template.ts
    ├── hooks/
    │   └── useProjects.ts
    └── pages/
        ├── ProjectList.tsx
        └── ProjectNew.tsx
```

总计 20 个文件（任务清单列 17 个，加上隐性 `tsconfig.node.json` / `src/vite-env.d.ts` / `postcss.config.js`）。

---

## 7. 给后续阶段的提示

- **T-FE-C** 若要替换 `ProjectCardInline` 为 `components/ProjectCard.tsx`，记得：
  1. `ProjectCard` 接受 `project: Project` props
  2. 显示「进度环 + 截止倒计时 + 状态徽章」
  3. 高亮规则：≤ 3 天红框、< 0 天红框加深、> 7 天绿框
- **T-FE-T**（前端测试）可优先覆盖 `lib/format.ts` 与 `lib/status.ts`（纯函数，单测零成本）。
- **T-BE-T**（后端测试）已自行完成 80/90 PASS；剩 10 个 FAIL 在 `deliverable.md` 里有详细修复表。

---

> 等待 verifier 验证 → 进入 ⑥.5 集成验证
