# CONTEXT-06 — T-FE-B 编码阶段交付报告

> 任务：T-FE-B — 项目详情 + 资料项 + 文件
> 执行者：coder agent（mvs_7ff8e024af054604816a6ca63248cf12）
> 日期：2026-06-09
> 状态：**DONE**（npm run build ✅ PASS）
> 关联：docs/CONTEXT-04.md、docs/PLAN.md §3.3、docs/DESIGN.md §3/§8、docs/SPEC.md §2/§3/§7

---

## 1. 已完成（10/10 文件 + build 验证）

| 文件 | 行数 | 状态 |
|------|------|------|
| `frontend/src/api/items.ts` | 152 | ✅ |
| `frontend/src/api/files.ts` | 101 | ✅ |
| `frontend/src/hooks/useItems.ts` | 121 | ✅ |
| `frontend/src/hooks/useDeadlineStatus.ts` | 123 | ✅ |
| `frontend/src/components/StatusBadge.tsx` | 34 | ✅ |
| `frontend/src/components/ItemRow.tsx` | 163 | ✅ |
| `frontend/src/components/FileList.tsx` | 172 | ✅ |
| `frontend/src/components/UnclaimedFiles.tsx` | 138 | ✅ |
| `frontend/src/pages/ProjectDetail.tsx` | 332 | ✅ |
| `frontend/src/pages/ProjectEdit.tsx` | 261 | ✅ |

**npm run build** ✅ 通过（1697 modules transformed, 2.33s）

```
dist/index.html                 0.47 kB │ gzip:  0.34 kB
dist/assets/index-C9yjlxWU.css 25.04 kB │ gzip:  4.97 kB
dist/assets/index-Cn6fOCt3.js  290.30 kB │ gzip: 94.88 kB
✓ built in 2.33s
```

---

## 2. 实现摘要

### 2.1 API 契约对齐

所有 API 调用与 `backend/app/routers/items.py`、`files.py`、`projects.py` 一一对应：

| API 文件 | 函数 | 端点 |
|---------|------|------|
| `api/items.ts` | `listItems` | `GET /api/projects/{id}/items` |
| `api/items.ts` | `addItem` | `POST /api/projects/{id}/items` |
| `api/items.ts` | `updateItem` | `PATCH /api/items/{id}`（仅 name/description/pages） |
| `api/items.ts` | `deleteItem` | `DELETE /api/items/{id}` |
| `api/items.ts` | `confirmItem` | `POST /api/items/{id}/confirm` |
| `api/items.ts` | `rejectItem` | `POST /api/items/{id}/reject` |
| `api/items.ts` | `resetItem` | `POST /api/items/{id}/reset` |
| `api/files.ts` | `listFiles` | `GET /api/items/{id}/files` |
| `api/files.ts` | `refreshItem` | `POST /api/items/{id}/refresh` |
| `api/files.ts` | `previewFileUrl` | `GET /api/files/{id}/preview` |
| `api/files.ts` | `downloadFileUrl` | `GET /api/files/{id}/download` |
| `api/files.ts` | `deleteFile` | `DELETE /api/files/{id}` |
| `api/files.ts` | `setPrimaryFile` | `POST /api/items/{id}/confirm`（绕行） |
| `api/files.ts` | `assignFile` | `POST /api/items/{id}/refresh`（绕行） |

### 2.2 状态机约束（前端已严格遵守）

**SPEC-ST-1 至 ST-5**：禁止前端直接调 `PATCH /api/items/{id}` 改 status。前端全部走 confirm/reject/reset 专用端点。

`ItemRow.tsx` 操作按钮按状态切换：
- **pending** → 无操作（"等待文件"灰字提示）
- **uploaded** → 「复核」「驳回」（驳回弹 `window.prompt` 输入必填 note）
- **rejected / confirmed** → 「重置」（带 `confirm()` 二次确认）

所有 mutation 成功后通过 `queryClient.invalidateQueries({ queryKey: itemKeys.byProject(projectId) })` 触发轮询立即刷新。

### 2.3 5 秒可见新增文件（SPEC-UI-3）

`useItems.ts` 配置 TanStack Query 3 秒轮询：

```ts
refetchInterval: 3000,
refetchIntervalInBackground: false,  // 切到其他 tab 停轮询省带宽
staleTime: 1000,
```

项目元信息（`useProject`）5 秒轮询，与 items 错峰避免双倍流量。

### 2.4 复用 T-FE-A 的契约

| 消费方 | T-FE-A 实际导出 | 我的用法 |
|--------|---------------|---------|
| API 客户端 | `export const apiClient` (named + default) | `import { apiClient } from './client'` |
| 状态样式 | `export function getItemStatusStyle(status)` + `ITEM_STATUS` 表 | `StatusBadge.tsx` 调用 `getItemStatusStyle()` |
| 文件大小格式化 | `export function formatFileSize(bytes)` | `FileList.tsx` / `UnclaimedFiles.tsx` 用之 |
| 类型定义 | `src/types/index.ts` 的 `Item`、`ItemListResponse`、`FileInfo`、`ItemStatus` | 全部 import 自 `'../types'` |

### 2.5 App.tsx 集成（关键修复）

T-FE-A 的 `App.tsx` 用 `React.lazy()` 动态加载本任务的两个页面：

```ts
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'))
const ProjectEdit = lazy(() => import('@/pages/ProjectEdit'))
```

`lazy()` 要求页面**默认导出**。本任务原版用 `export function` 命名导出，会触发 tsc：
```
src/App.tsx(27,34): error TS2322: ... 'default' is missing in type ...
```

**修复**：给两个页面文件末尾追加 `export default ProjectDetail;` / `export default ProjectEdit;`，命名导出保留。修复后 build 一次过。

---

## 3. ⚠️ 已知后端缺口（前端已记录 + UI 兜底）

### 3.1 POST /api/items/{id}/files/{file_id}/primary

SPEC §3.2 列出此端点用于"设为主文件"，但 `backend/app/routers/items.py` **未实现**。

**前端绕行**（`api/files.ts` 中的 `setPrimaryFile()`）：
```ts
export async function setPrimaryFile(itemId: string, fileId: string): Promise<void> {
  // 调用 /confirm 同时设主文件 + 把 status 翻为 confirmed
  await apiClient.post(`/api/items/${itemId}/confirm`, { primary_file_id: fileId });
}
```

**副作用**：此操作同时把 item.status 改为 `confirmed`。前端在 `FileList.tsx` 的 `handleSetPrimary()` 中用 `window.confirm()` 明确提示用户：

> "将 {filename} 设为主文件？
> ⚠️ 当前实现会同时把此资料项标记为已确认。"

**生产修复**：后端补上专用端点后，前端改为：
```ts
await apiClient.post(`/api/items/${itemId}/files/${fileId}/primary`);
```

### 3.2 POST /api/items/{id}/files/{file_id}/assign

SPEC-FW-6 提到的"手动指派未认领文件"端点也未实现。

**前端绕行**（`UnclaimedFiles.tsx` + `api/files.ts` 中的 `assignFile()`）：
- 用户在下拉中选择目标 item，点击「指派」
- 前端调用 `refreshItem(targetItemId)` 触发该 item 子文件夹重新扫描
- UI 提示用户**手动把文件移动到对应子文件夹**（让 watcher 接管）

**未来增强**：补专用端点后可直接 `POST /api/items/{itemId}/files/{fileId}/assign`，省去物理移动步骤。

---

## 4. 设计取舍

### 4.1 轮询策略

- **items**：3s（满足 SPEC-UI-3 "5s 内必显示新增文件"）
- **project meta**：5s（错峰避免双倍流量；items 比 project 更敏感）
- **refetchIntervalInBackground: false**：切到其他 tab 停轮询节省带宽
- `staleTime: 1000`：1s 内不重新拉，但仍按 interval 触发

### 4.2 操作 UX

- **驳回**：弹 `window.prompt` 输入必填 note；trim 后空字符串校验失败给 `alert`
- **重置**：弹 `window.confirm` 二次确认（避免误操作清掉进度）
- **删除文件**：`window.confirm` 二次确认；后端不删物理文件，仅从 files 表移除
- **设为主文件**：`window.confirm` + 明确副作用提示（见 §3.1）
- **mutating 中**：所有按钮 disabled，避免重复点击导致 race condition

### 4.3 渲染细节

- **StatusBadge**：复用 T-FE-A 的 `getItemStatusStyle()`，仅做轻量包装（圆角胶囊 + emoji + label）
- **ItemRow**：单行可展开/收起（▶/▼ 切换），展开后展示 `FileList`
- **文件数显示**：`{fileCount} 文件` 或 `无文件`（鼠标悬停显示完整 tooltip）
- **主文件标记**：绿色 ★ 图标 + tooltip "主文件（用于结算书合并）"
- **未认领文件**：黄色背景突出，每个文件一行 + 「预览/下载/指派」三按钮
- **「生成结算书」按钮**：仅当 `progress.confirmed === progress.total && total > 0` 时启用，否则置灰 + tooltip 提示

### 4.4 错误展示

- 整页错误（加载失败）：红色面板 + 「重试」按钮
- 单项 mutation 错误：固定位置红框显示 message
- 文件删除/主文件错误：行内红色小字 + 立即显示，不阻塞其他操作

---

## 5. 数据流

```
用户拖文件 → watchdog 入库 → GET /api/projects/{id}/items
                                    ↓ (3s 轮询)
                              ProjectDetail.tsx
                                    ↓
                          ItemRow.tsx (状态徽章 + 按钮)
                                    ↓
                          FileList.tsx (展开后可见)
                                    ↓
              「复核」/「驳回」/「重置」→ confirm/reject/reset 端点
                                    ↓
                          invalidateQueries → 立即刷新
```

未认领文件走单独通道：

```
watchdog 模糊匹配失败 → _unclaimed/ 暂存 → GET /items 返回 unclaimed
                                                       ↓
                                            UnclaimedFiles.tsx
                                                       ↓
                                  用户「指派给某项」→ refreshItem(targetItemId)
                                                       ↓
                                                  提示物理移动
```

---

## 6. 与 SPEC §11 剧本的对应

| 剧本 | 本任务覆盖 |
|------|----------|
| 1. 建项目 → 准备 → 复核 → 生成 | 复核（confirmMut）、驳回（rejectMut）、重置（resetMut）按钮；3s 轮询让用户 5s 内看到状态变化 |
| 4. 截止日期紧急 | `useDeadlineStatus.ts` 计算 `daysToDeadline` + 三档颜色（normal/urgent/overdue） + 卡片背景色切换 |

---

## 7. 给 verifier 的备注

1. **build 一次过**：`tsc -b && vite build` 无任何 TS 错误（详见 §1 的输出）。
2. **状态机约束**：源码搜索 `PATCH /api/items/${itemId}` 中调用无 `status` 字段，全部走 confirm/reject/reset。
3. **轮询**：详情页 mount 后立即触发首次拉取 + 每 3s 一次；切 tab 停轮询。
4. **后端缺口**：见 §3，前端 UI 已加明确提示，后端补端点后只需改 `api/files.ts` 一处。
5. **App.tsx 集成**：本任务给两个页面加了 `export default`，命名导出保留（其他地方如果用命名 import 仍可用）。
6. **store/app.ts（zustand）依赖**：本任务未直接使用，避免与 T-FE-C 的 zustand store 耦合。如未来需要 toast 通知，可改用 `useAppStore.getState().pushToast()`。

---

## 8. 文件清单（git status 中预期新增）

```
frontend/src/api/items.ts
frontend/src/api/files.ts
frontend/src/hooks/useItems.ts
frontend/src/hooks/useDeadlineStatus.ts
frontend/src/components/StatusBadge.tsx
frontend/src/components/ItemRow.tsx
frontend/src/components/FileList.tsx
frontend/src/components/UnclaimedFiles.tsx
frontend/src/pages/ProjectDetail.tsx
frontend/src/pages/ProjectEdit.tsx
docs/CONTEXT-06-T-FE-B.md
```

---

> 任务完成。`npm run build` 一次通过；所有 SPEC §2 状态机约束已遵守；后端两个缺口已在代码注释 + 本文档显式标注，verifier 跟进即可。