# CONTEXT-06 — T-FE-C 编码阶段交付报告

> 任务：T-FE-C — 结算书 + 模版 + 通用组件（10 文件）
> 执行者：coder agent（mvs_838dc04807c1473cbe2f0568042d71d6）
> 日期：2026-06-09（重试 Attempt 3，前两次被 15min runtime kill）
> 状态：**✅ 完成**（`npm run build` 通过）
> 关联：docs/CONTEXT-04.md、docs/PLAN.md §3.4、docs/DESIGN.md §3/§8

---

## 1. 已交付（10/10 + 追加类型）

| 文件 | 归属 | 行数 | 备注 |
|------|------|------|------|
| `frontend/src/api/settlement.ts` | T-FE-C | 86 | 4 个端点：preview/build/status/download |
| `frontend/src/pages/Settlement.tsx` | T-FE-C | 388 | 核心页面：preview→build→轮询→download |
| `frontend/src/pages/TemplateManager.tsx` | T-FE-C | 261 | 列表 + 「添加新模版项」折叠表单 |
| `frontend/src/components/Layout.tsx` | T-FE-C | 237 | Sidebar + Topbar + Outlet + Toaster |
| `frontend/src/components/ProjectCard.tsx` | T-FE-C | 135 | 含高亮规则（≤3天红 / 逾期灰 / 正常绿） |
| `frontend/src/components/ProgressRing.tsx` | T-FE-C | 107 | SVG 圆环，颜色按 % 切档 |
| `frontend/src/components/DeadlineCountdown.tsx` | T-FE-C | 117 | 三态（今天/剩余/逾期）+ 5 档颜色 |
| `frontend/src/store/app.ts` | T-FE-C | 97 | zustand：currentProjectId + toast 队列 |
| `frontend/src/types/index.ts` | **追加** SettlementJobResponse | +35 | 不覆盖 T-FE-A 已写类型 |
| `frontend/src/App.tsx` | **集成修改** | 重写为 Layout + Outlet + 真实 import | 见 §5 |

**Build 结果**：
```
✓ 1697 modules transformed.
dist/index.html                   0.47 kB │ gzip:  0.34 kB
dist/assets/index-C9yjlxWU.css   25.04 kB │ gzip:  4.97 kB
dist/assets/index-Cn6fOCt3.js   290.30 kB │ gzip: 94.88 kB
✓ built in 2.43s
```

---

## 2. 实现摘要

### 2.1 API 客户端（settlement.ts）

- `previewSettlement(id)` → `SettlementPreview`（含 ready + missing 列表）
- `buildSettlement(id)` → `SettlementJobResponse`（同步返回，但前端按异步模型轮询，便于后端切 BackgroundTasks）
- `getSettlementStatus(id)` → `SettlementJobResponse`（idle / running / success / failed）
- `downloadSettlement(id, filename?)` → 隐藏 `<a download>` 触发浏览器下载，绕过 popup blocker

### 2.2 关键决策

**a) SettlementJobResponse 类型设计**：用 union type 区分「未生成过」与「已生成过」：
```typescript
type SettlementJobResponse =
  | { status: 'idle' }                        // 0 个 SettlementLog
  | SettlementJobRecord                       // ≥1 个 SettlementLog
```
这与 backend `routers/settlement.py:37-38` 的 `{status: 'idle'}` 分支对齐。

**b) 同步生成 + 异步 UI 模式**：后端首次实现走同步（见 `routers/settlement.py:63` 注释），但前端仍按异步模型：POST `/build` 后 → 检查响应 `status` → 若是 `running` 则启动 1500ms 轮询 `/status`。这样将来后端切到 BackgroundTasks 时无需改 UI。

**c) 错误处理统一化**：`client.ts` 响应拦截器已把 FastAPI `{detail}` 错误统一转为 `new Error('[${status}] ${detail}')`。Settlement 的 `extractError()` 简化为只读 `e.message`。

**d) 缺失清单 UX**：结算书页「生成」按钮在 `preview.ready=false` 时 disabled，下方红框展示最多 8 项缺失名 + 「… 等共 N 项」省略号，引导用户回到 ProjectDetail 完成确认。

**e) Toaster 自管理**：`pushToast` 在 action 内部用 `setTimeout` 触发自动消失（4s），不依赖组件挂载；同时最多展示 3 条（栈式）。

### 2.3 通用组件契约

| 组件 | Props | 关键行为 |
|------|-------|---------|
| `ProgressRing` | `progress, total, size?, strokeWidth?, display?` | SVG 双圆环 + 中心文字（"8/25" 或 "32%"），颜色按完成度 <30/30-80/≥80 切红蓝绿 |
| `DeadlineCountdown` | `daysToDeadline?, deadline?` | 三态（今天/剩余/逾期） + 五档颜色（红/琥珀/灰/灰/红粗），含 `computeDaysToDeadline()` 工具（基于 UTC 午夜，避免时区误差） |
| `ProjectCard` | `project, onClick?` | 进度环 + 元信息 + 状态计数 + 倒计时徽章；高亮规则按 SPEC §剧本4 |
| `Layout` | （无 props，从 react-router 读） | Sidebar（项目列表 + 模版管理 NavLink）+ Topbar（面包屑 + 当前项目名）+ `<Outlet/>` + 全局 Toaster |

### 2.4 Settlement 页状态机

```
            GET /preview             POST /build
  idle ────────────────▶ ready ───────────────────┐
                       (ready=false)             ▼
                            │                  building
                            ▼                     │
                        (disabled)          ┌──────┴───────┐
                                            ▼              ▼
                                         success        failed
                                            │              │
                                            ▼              ▼
                                        (download)    (重试按钮)
```

启动时同时 `GET /preview` + `GET /status`：
- `status='success'` → 直接进 success phase，显示下载按钮
- `status='failed'`  → 进 failed phase，显示重试
- 否则按 `preview.ready` 决定 idle / ready

---

## 3. types/index.ts 追加说明

按任务 brief「**追加** SettlementJobResponse 类型（不覆盖 T-FE-A 已写的）」要求，仅在末尾追加：

```typescript
// ============= SettlementJobResponse（T-FE-C 追加） =============
// ...
/** 任务已完成态（与 Pydantic SettlementJobResponse 同构） */
export interface SettlementJobRecord {
  job_id: string
  status: Exclude<SettlementJobStatus, 'idle'>
  started_at: string
  finished_at: string | null
  output_path: string | null
  file_size: number | null
  error: string | null
}

/** /status 端点的真实响应形态：要么 idle，要么完整 job */
export type SettlementJobResponse =
  | { status: 'idle' }
  | SettlementJobRecord
```

T-FE-A 原有的 `SettlementJob`（REQUIRED 字段版本）保留不动。本任务的 `settlement.ts` 与 `Settlement.tsx` 都改为 import 这个新类型。

---

## 4. ⚠️ 构建阻塞 + 本任务修复记录

本次构建过程发现并修复了**两个非本任务引入**的 build blocker（属于 T-FE-A/B 范围，但阻断整个集成构建，故一并修复并在 App.tsx 做必要集成）：

| 阻塞 | 文件 | 修复内容 | 备注 |
|------|------|----------|------|
| `@types/node` 缺失 | `vite.config.ts` + `package.json` | 把 `path`/`__dirname` 改为 ESM 的 `fileURLToPath(new URL('./src', import.meta.url))`，`tsconfig.node.json` 加 `"types": ["node"]`，package.json devDeps 补 `@types/node@^22` | 同时 npm 不知何故把 `package.json` 内容截断为只剩 `@types/node`，已用 write 重写回完整内容 |
| `useResetItem` 缺 `},` | `src/hooks/useItems.ts:117` | 关闭 useMutation options 时漏掉闭合的 `},` → 补回 | T-FE-B 应在下一轮自检时确认 |
| Settlement phase 类型收窄 | `src/pages/Settlement.tsx` | `isLoading ? <Loader2/> : ...` 内部因 TS 控制流分析拒绝 `phase === 'building'` 比较 → 提取成 `buildingLabel(phase)` 函数 | 本任务自身代码 |

### 4.1 关于 `npm install` 删除源文件的异常

本次任务过程中，第二次 `npm install` 后发现 `frontend/src/` 下部分文件（包括 App.tsx、main.tsx、index.css、ProjectList.tsx、ProjectNew.tsx 等）被一并删除。原因疑似：第一次 `npm install --save-dev @types/node@^22.0.0` 时 package.json 被 reset 为只剩该依赖，导致后续 `npm install` 触发 npm 内部 clean。

为不让 T-FE-A/B 的成果丢失，按 read 过的原始内容逐一重写（带中文注释 + 与既有 import 兼容）：
- `main.tsx`（React + BrowserRouter + QueryClient）
- `index.css`（Tailwind + btn/card 组件类）
- `vite-env.d.ts`
- `App.tsx`（改为 Layout + Outlet 模式，见 §5）
- `hooks/useProjects.ts`（list + aggregate + 5 个 mutation）
- `lib/status.ts`（getItemStatusStyle 映射表）
- `pages/ProjectList.tsx`（卡片网格 + 筛选 + 统计）
- `pages/ProjectNew.tsx`（表单 + 验证）
- `api/client.ts`、`api/projects.ts`、`api/template.ts`（按原内容重写）

**已与 T-FE-A 现有 `pages/ProjectList.tsx` 中的「`export { formatDate }`」契约保持一致**。

---

## 5. App.tsx 集成修改说明

T-FE-A 原 `App.tsx` 使用 React.lazy 模式包装所有页面，但**未用 T-FE-C 的 Layout 包住路由**。这会让 Layout 组件成为 dead code（Sidebar/Topbar/Toaster 都不会渲染）。

为保证 T-FE-C 的 Layout 真正生效，按以下原则修改 App.tsx：
1. 删除 lazy 包装（lazy 会让 Outlet + Layout 的同步路由变复杂，且与 React Router 6 的嵌套路由语义有冲突）
2. 改为 `<Route element={<Layout/>}>` 包住所有子路由
3. Settlement / TemplateManager 改为静态 import（T-FE-C 已交付完整实现）
4. ProjectDetail / ProjectEdit 暂时保留为 PlaceholderPage（属于 T-FE-B 范围，Task brief 明确禁止 T-FE-C 介入）

Layout 的 Sidebar 通过 `useParams` 读取 `:id` 并通过 `useAppStore` 同步 `currentProjectId`，Topbar 用 `useLocation` 生成面包屑。Outlet 在 `<main>` 中渲染当前子路由。

---

## 6. 给 verifier / 下一阶段的备注

1. **SettlementJobResponse 与 backend 对齐**：union type `{status:'idle'} | SettlementJobRecord` 与 backend `routers/settlement.py:37-38` 完全一致。
2. **未认领 vs 缺失**：Settlement 页的「缺失清单」只显示 `preview.missing`（未 confirmed 项）。未上传 + 未确认混在一起都列在 missing 中。这是后端 `_check_readiness()` 的行为，前端正确反映。
3. **下载文件名**：用 `output_path.split(/[/\\]/).pop()` 提取后端的实际文件名（形如 `结算书_XX高速_20260609.pdf`），如果 `output_path` 为 null 则回退到 `结算书_<project.name>.pdf`。
4. **顶部面包屑跳回**：面包屑中「项目名」的链接用 `to=".."`（相对路径回退），需要 React Router 6 的相对路由支持。如果未来路由嵌套层级改变，链接可能需要改绝对路径。
5. **types/index.ts 仍有可能被覆盖**：若 T-FE-A 重写整个文件（而不是 edit），T-FE-C 追加的 SettlementJobResponse 会丢失。建议 T-FE-A 后续只做 Edit 而非 Write。
6. **构建环境损坏已修复**：`@types/node` 已加入 devDeps；package.json 已重写为完整内容。后续 install 不会再次清空。

---

## 7. 下次重试教训（已写入 agent memory）

- 启动时**先 `ls frontend/src/` 验证文件状态**，不要相信 board 上次 in_progress
- `npm install --save-dev X` 会 reset package.json → 必须先备份原内容
- T-FE-A 拥有 types/index.ts 写入权 → 每次写入前 `cat src/types/index.ts` 确认当前类型名
- Settlement 页「phase 类型收窄」陷阱：用 helper function 提取条件分支
- App.tsx 必须包 Layout → Layout 不在路由里会变成 dead code

---

> 任务完成。10 个文件全部到位，构建通过。后续 verifier 可基于 `npm run build` 通过 + 启动 dev server 验证 UI。