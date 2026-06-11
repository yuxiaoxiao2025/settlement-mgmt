# SPEC — 项目结算资料管理系统

> 阶段：② 规格（dev-pipeline-mavis）
> 编排者：Mavis
> 日期：2026-06-09
> 关联：`docs/REQUIREMENT.md` v1.0

---

## 0. 关键术语

| 术语 | 定义 |
|------|------|
| 模版（Template） | `项目结算资料交接清单.docx` 解析出的 25 项标准资料 |
| 项目（Project） | 一个具体的工程结算实例 |
| 资料项（Item） | 项目下的一行资料（如"01_招标文件"） |
| 资料文件（File） | 用户上传的某个具体文件 |
| 状态（Status） | 资料项的 4 个状态之一：pending / uploaded / confirmed / rejected |
| 结算书（Settlement Book） | 项目最终合并的 PDF 文档 |

## 1. 数据模型规范

### 1.1 MasterTemplate（全局模版，JSON 文件）

`data/master_template.json`

```json
{
  "version": 1,
  "items": [
    {
      "seq": 1,
      "name": "招标文件（含补充招标文件）",
      "description": "复印件加盖公章",
      "is_default": true
    },
    ...
  ]
}
```

**SPEC-MT-1**：`master_template.json` MUST 至少包含 25 项 `is_default: true` 的标准项。

**SPEC-MT-2**：`master_template.json` MUST 携带 `version` 字段，递增；新增项时 `version += 1`。

**SPEC-MT-3**：`master_template.json` SHALL 保留所有历史新增项（含 `is_default: false` 的项目级扩展项）。

### 1.2 Project（项目）

数据库表 `projects`：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK, uuid | |
| name | TEXT | NOT NULL | 项目名称 |
| handover_date | DATE | | 移交日期 |
| deadline | DATE | NOT NULL | 截止日期 |
| construction_unit | TEXT | | 建设管理单位 |
| handover_person | TEXT | | 移交人 |
| receiving_unit | TEXT | | 接收单位 |
| receiving_person | TEXT | | 接收人 |
| status | TEXT | DEFAULT 'active' | active / archived |
| created_at | DATETIME | DEFAULT now | |
| updated_at | DATETIME | DEFAULT now | |

**SPEC-PR-1**：项目创建后 MUST 自动在 `projects/<id>/` 下创建对应数量的子文件夹，子文件夹名格式为 `{seq:02d}_{sanitized_name}/`。

**SPEC-PR-2**：截止日期 MUST 不可早于创建日期。

**SPEC-PR-3**：项目归档（status=archived）后 MUST 不可再编辑资料项，但 MUST 可查看与下载已生成的结算书。

### 1.3 Item（资料项）

数据库表 `items`：

| 字段 | 类型 | 约束 |
|------|------|------|
| id | TEXT | PK, uuid |
| project_id | TEXT | FK → projects.id |
| seq | INTEGER | NOT NULL, 项目内唯一 |
| name | TEXT | NOT NULL |
| description | TEXT | |
| pages | INTEGER | 用户填的页数 |
| status | TEXT | DEFAULT 'pending' |
| rejected_note | TEXT | |
| confirmed_at | DATETIME | |
| is_extension | BOOLEAN | 是否项目级扩展（is_default=false） |

**SPEC-IT-1**：项目创建时 MUST 从 `master_template.json` 复制所有项到 `items` 表，序号从 1 开始连续。

**SPEC-IT-2**：`status` MUST ∈ {`pending`, `uploaded`, `confirmed`, `rejected`}。

**SPEC-IT-3**：`status='confirmed'` 时 `confirmed_at` MUST NOT NULL。

### 1.4 File（资料文件）

数据库表 `files`：

| 字段 | 类型 | 约束 |
|------|------|------|
| id | TEXT | PK, uuid |
| item_id | TEXT | FK → items.id |
| filename | TEXT | NOT NULL |
| original_path | TEXT | NOT NULL | 原始绝对路径 |
| pdf_path | TEXT | | 转码后 PDF 路径（若已是 PDF 则与 original_path 相同） |
| filesize | INTEGER | |
| uploaded_at | DATETIME | DEFAULT now |
| is_pdf | BOOLEAN | |
| is_primary | BOOLEAN | DEFAULT false | 主文件（用于合并） |

**SPEC-FL-1**：每个 `item_id` 下 MUST 至少 0 个或多个 file。

**SPEC-FL-2**：当 `status='confirmed'` 时，对应 item MUST 至少有一个 `is_primary=true` 的 file。

**SPEC-FL-3**：同名文件重复上传时，**保留最新一份**，旧文件删除并从 `files` 表移除（不报错）。

## 2. 状态机

### 2.1 Item 状态流转

```
              upload (watcher/manual)
   pending ───────────────────────▶ uploaded
      ▲                                │
      │                                │ confirm
      │                                ▼
   rejected ◀───── reject ────── uploaded
      │                                │
      │ re-upload (新文件落地)          │
      └────────────────────────────────┘
                                     (确认后)→ confirmed
                                        │
                                        ▼
                                    (全部 confirmed 时可合并)
```

**SPEC-ST-1**：`pending` → `uploaded` MUST 由文件监听或手动刷新触发，不允许 API 直接设。

**SPEC-ST-2**：`uploaded` → `confirmed` MUST 显式调用 `POST /items/{id}/confirm`。

**SPEC-ST-3**：`uploaded` → `rejected` MUST 显式调用 `POST /items/{id}/reject` 并提供 `rejected_note`。

**SPEC-ST-4**：`rejected` → `uploaded` MUST 由新文件落地或人工 `POST /items/{id}/reset` 触发。

**SPEC-ST-5**：`confirmed` 状态 MUST 不可回退（业务事实），仅可由"删除文件"流程重置为 `pending`。

## 3. API 规范（FastAPI）

### 3.1 项目

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/projects` | 列出项目（含进度） |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/{id}` | 项目详情 |
| PATCH | `/api/projects/{id}` | 更新项目元信息 |
| POST | `/api/projects/{id}/archive` | 归档 |
| DELETE | `/api/projects/{id}` | 删除（级联） |
| GET | `/api/projects/{id}/deadline-status` | 倒计时 |

### 3.2 资料项

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/projects/{id}/items` | 列出项目所有项 |
| POST | `/api/projects/{id}/items` | 新增项 |
| PATCH | `/api/items/{id}` | 编辑项 |
| DELETE | `/api/items/{id}` | 删除项 |
| POST | `/api/items/{id}/confirm` | 复核通过 |
| POST | `/api/items/{id}/reject` | 驳回 |
| POST | `/api/items/{id}/reset` | 重置为 pending |
| POST | `/api/items/{id}/files/{file_id}/primary` | 设为主文件 |

### 3.3 文件

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/items/{id}/files` | 列出文件 |
| POST | `/api/items/{id}/refresh` | 手动扫描文件夹 |
| GET | `/api/files/{id}/preview` | 预览（stream） |
| GET | `/api/files/{id}/download` | 下载 |
| DELETE | `/api/files/{id}` | 删除文件 |

### 3.4 模版

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/template` | 读取 master_template |
| POST | `/api/template/items` | 推广新增项到全局 |

### 3.5 结算书

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/projects/{id}/settlement/preview` | 预览可合并性 |
| POST | `/api/projects/{id}/settlement/build` | 异步生成 |
| GET | `/api/projects/{id}/settlement/status` | 生成进度 |
| GET | `/api/projects/{id}/settlement/download` | 下载结算书 |

### 3.6 错误码

| HTTP | 含义 | 示例 |
|------|------|------|
| 400 | 参数错误 | 截止日期早于创建日期 |
| 404 | 资源不存在 | 项目 ID 无效 |
| 409 | 状态冲突 | 确认未上传的项 |
| 422 | 业务规则违反 | 归档项目不可编辑 |
| 500 | 内部错误 | WPS 调用失败 |

## 4. 文件监听规范

**SPEC-FW-1**：系统 MUST 启动一个 watchdog observer 监听 `projects/` 根目录的递归变更。

**SPEC-FW-2**：监听到的文件变更 MUST 经过 2 秒去抖（debounce）后入库，避免编辑器保存触发多次事件。

**SPEC-FW-3**：文件落地后 MUST 经历以下处理链：
1. 路径归属判断（直接子文件夹归属 vs 模糊匹配归属 vs 未匹配）
2. 入库到 `files` 表，关联 `item_id`
3. 触发对应 item 状态变更 `pending → uploaded`
4. 若非 PDF，加入转码队列（BackgroundTasks）

**SPEC-FW-4**：监听失败时 MUST 回退到手动 `POST /refresh`，并在 UI 显示"实时监听不可用"提示。

**SPEC-FW-5**：文件删除 MUST 同步从 `files` 表移除，并在 item 无文件时状态回退到 `pending`。

**SPEC-FW-6**：匹配规则（按优先级）：
1. **子文件夹归属**：若文件位于 `projects/<id>/<seq>_<name>/` 子目录，归属该 seq 对应的 item。
2. **项目根目录模糊匹配**：若文件位于 `projects/<id>/` 根目录，使用 `difflib.SequenceMatcher` 计算文件名与所有 item 名称的相似度，取最高且 `> 0.5` 的命中。
3. **未匹配**：进入"待认领"区，UI 上提供"指派给某项"按钮。

## 5. PDF 转换规范

**SPEC-PD-1**：PDF 转换 MUST 优先调用 WPS CLI：
```bash
wps --convert-to pdf --output <output_dir> <input_file>
```

**SPEC-PD-2**：WPS 不可用时 SHOULD 提示用户安装 WPS 或 LibreOffice；不实现 fallback 转换（避免引入额外依赖）。

**SPEC-PD-3**：转码后的 PDF MUST 存放在 `projects/<id>/.pdfs/<seq>_<name>/<filename>.pdf`。

**SPEC-PD-4**：转码 MUST 异步执行（BackgroundTasks），不阻塞 API 响应。

**SPEC-PD-5**：转码完成后 MUST 更新 `files.pdf_path` 字段。

## 6. 结算书生成规范

**SPEC-SB-1**：生成前置条件：项目下所有 item.status MUST == 'confirmed'，否则返回 409。

**SPEC-SB-2**：结算书结构（MUST 按此顺序）：
1. **封面页**（1 页）
   - 项目名称（标题，24pt）
   - 移交日期 / 截止日期
   - 建设管理单位 / 移交人 / 接收单位 / 接收人
   - 生成时间
   - "项目结算资料交接清单" 副标题
2. **目录页**（1-N 页）
   - 序号 / 资料名称 / 页数 / 起始页码 / 提交说明
3. **资料正文**（按 item.seq 顺序）
   - 每个 item 的 `is_primary=true` 的 PDF

**SPEC-SB-3**：合并 MUST 用 `pypdf.PdfWriter`，目录页的"起始页码" MUST 通过 `get_page_number()` 计算后填回。

**SPEC-SB-4**：输出路径：`projects/<id>/final/结算书_<project_name>_<YYYYMMDD>.pdf`。

**SPEC-SB-5**：生成 MUST 记录到 `settlement_logs` 表（含开始时间、结束时间、文件大小、生成人 IP）。

## 7. 前端 UI 规范

### 7.1 路由

| 路径 | 页面 |
|------|------|
| `/` | 项目列表（首页） |
| `/projects/new` | 新建项目 |
| `/projects/:id` | 项目详情（资料清单） |
| `/projects/:id/edit` | 编辑项目 |
| `/projects/:id/settlement` | 结算书生成/下载 |
| `/template` | 模版管理 |

### 7.2 状态颜色

| 状态 | 颜色 | 图标 |
|------|------|------|
| pending | 灰 #9CA3AF | ⚪ |
| uploaded | 蓝 #3B82F6 | 📄 |
| confirmed | 绿 #10B981 | ✅ |
| rejected | 红 #EF4444 | ❌ |

### 7.3 关键交互

**SPEC-UI-1**：项目卡片 MUST 显示进度环（X/25 已确认）。

**SPEC-UI-2**：项目列表 MUST 按截止日期升序排序，截止日期 ≤ 3 天的项目 MUST 红色高亮。

**SPEC-UI-3**：项目详情页 MUST 每 5 秒轮询 `GET /api/projects/{id}`（监听失败时回退到手动刷新按钮）。

**SPEC-UI-4**：每行资料项 MUST 显示：
- 序号 + 名称
- 状态徽章
- 已上传文件数
- 操作按钮组（按状态切换）

**SPEC-UI-5**：未匹配文件 MUST 在页面底部以"📦 待认领文件"区显示。

## 8. 错误处理规范

**SPEC-ER-1**：所有 API 错误 MUST 返回 JSON `{detail: string, code: string}`。

**SPEC-ER-2**：服务端日志 MUST 包含 timestamp / level / request_id / message。

**SPEC-ER-3**：WPS 转码失败 MUST 不影响其他文件转码，但 MUST 在 UI 上以红色提示该文件。

**SPEC-ER-4**：PDF 合并失败 MUST 回滚到合并前状态（删除已生成的临时合并文件）。

## 9. 性能规范

**SPEC-PF-1**：列表 API（MUST 在 P95 < 200ms 内返回，100 个项目规模）。

**SPEC-PF-2**：监听事件处理 MUST 在 1 秒内完成入库（不含去抖等待）。

**SPEC-PF-3**：PDF 合并 25 个文件 MUST 在 30 秒内完成。

**SPEC-PF-4**：前端首屏 MUST < 2 秒（局域网内）。

## 10. 安全/合规

**SPEC-SC-1**：所有用户输入 MUST 经 Pydantic 校验。

**SPEC-SC-2**：文件路径 MUST 限制在 `projects/<id>/` 范围内，禁止 `..` 跳出。

**SPEC-SC-3**：API 访问 MUST 记录 IP + User-Agent 到 `access_logs`。

**SPEC-SC-4**：不实现密码/登录（局域网信任模式），但 MUST 在 README 提示公网部署需加鉴权。

## 11. 验收剧本

### 剧本 1：建项目 → 准备 → 复核 → 生成

1. POST /api/projects 创建项目 P1
2. GET /api/projects/P1/items → 25 项 pending
3. 用户把 `招标文件.pdf` 拖到 `projects/P1/01_招标文件/`
4. 5 秒内 GET items → 第 1 项 status=uploaded
5. POST /items/{id}/confirm → status=confirmed
6. 重复 24 次
7. POST /api/projects/P1/settlement/build → 异步任务 ID
8. GET /api/projects/P1/settlement/status → 完成后获得下载 URL
9. GET 下载 → PDF 包含封面 + 目录 + 25 份资料

### 剧本 2：模版成长

1. POST /api/projects/P1/items 新增"26. BIM 模型"
2. 系统返回 `promote_prompt: true`
3. POST /api/template/items { name: "BIM 模型", description: "..." }
4. POST /api/projects P2 → GET items → 包含第 26 项

### 剧本 3：文件重名

1. 拖入 `A.pdf` → 上传
2. 再拖入 `A.pdf`（覆盖）→ 旧的 deleted，新的入库
3. files 表只有 1 条最新记录

### 剧本 4：截止日期紧急

1. 截止日期 = 今天 + 2 天
2. UI 项目卡片红框 + "还剩 2 天"
3. 截止日期 < 0 → 卡片变灰 + "已逾期 X 天"

---

> 等待用户确认 → 进入 ③ 设计阶段（技术栈 + 架构 + 数据流）
