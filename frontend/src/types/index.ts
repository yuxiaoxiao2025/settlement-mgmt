/**
 * 全局类型定义 — 与后端 Pydantic schema 保持一致（CONTEXT-04 §2.2）
 *
 * 本文件由 T-FE-A 写，是 T-FE-B / T-FE-C 的依赖源。
 * 任何字段变更 MUST 通知 Mavis 协调，避免破坏并行 worker 的构建。
 *
 * 字段 optionality 决策（与 backend Pydantic 一致）：
 *   - Project.progress / days_to_deadline: 后端 _to_response 总会附，REQUIRED
 *   - SettlementJob: 后端 /status 在「无日志」时返回 {status:'idle'}，
 *     其他字段可能缺失 → 全部 OPTIONAL，让前端窄化为 discriminated union
 *   - 其它可选字段（如 handover_date / pages）: 后端 Optional[X] → 前端 | null
 */

// ============= 状态枚举 =============

export type ItemStatus = 'pending' | 'uploaded' | 'confirmed' | 'rejected'
export type ProjectStatus = 'active' | 'archived'

/** 结算书任务状态 — 后端 /status 可能返回 'idle' 表示「尚未生成过」 */
export type SettlementJobStatus = 'idle' | 'running' | 'success' | 'failed'

// ============= 项目 =============

export interface ProjectProgress {
  total: number
  confirmed: number
  uploaded: number
  rejected: number
  pending: number
}

export interface Project {
  id: string
  name: string
  handover_date: string | null
  deadline: string
  construction_unit: string | null
  handover_person: string | null
  receiving_unit: string | null
  receiving_person: string | null
  status: ProjectStatus
  created_at: string
  progress: ProjectProgress
  days_to_deadline: number
}

/** POST /api/projects 请求体 */
export interface ProjectCreatePayload {
  name: string
  handover_date?: string | null
  deadline: string
  construction_unit?: string | null
  handover_person?: string | null
  receiving_unit?: string | null
  receiving_person?: string | null
  /**
   * 新建项目时勾选的模板项 seq 列表。
   * - undefined / null / [] → 沿用旧行为：建全量模板项（25 项）
   * - [1, 5, 7]             → 只建 seq 1/5/7 三项
   */
  selected_template_seqs?: number[] | null
}

/** PATCH /api/projects/{id} 请求体 — 全部 optional */
export interface ProjectUpdatePayload {
  name?: string
  handover_date?: string | null
  deadline?: string
  construction_unit?: string | null
  handover_person?: string | null
  receiving_unit?: string | null
  receiving_person?: string | null
}

// ============= 文件 =============

export interface FileInfo {
  id: string
  filename: string
  filesize: number
  is_pdf: boolean
  is_primary: boolean
  uploaded_at: string
}

// ============= 资料项 =============

export interface Item {
  id: string
  seq: number
  name: string
  description: string | null
  pages: number | null
  status: ItemStatus
  rejected_note: string | null
  confirmed_at: string | null
  is_extension: boolean
  files: FileInfo[]
}

export interface ItemListResponse {
  project_id: string
  items: Item[]
  unclaimed: FileInfo[]
}

// ============= 模版 =============

export interface TemplateItem {
  seq: number
  name: string
  description: string | null
  is_default: boolean
}

export interface Template {
  version: number
  items: TemplateItem[]
}

export interface PromoteRequest {
  name: string
  description?: string | null
}

export interface PromoteResponse {
  added: boolean
  new_version: number
  total_items: number
}

// ============= 结算书 =============

export interface SettlementPreview {
  ready: boolean
  missing: string[]
}

/**
 * 结算书任务状态。
 *
 * 后端实现差异（与 backend/app/routers/settlement.py 对齐）：
 *   - GET /status 在「无历史日志」时返回 { status: 'idle' } — 其它字段缺失
 *   - GET /status 在「有日志」时返回完整 SettlementJobResponse
 *   - POST /build 当前是同步，返回完整 SettlementJobResponse
 *
 * 因此前端所有字段都标 optional；调用方用 status 做 discriminated narrowing。
 */
export interface SettlementJob {
  job_id?: string
  status: SettlementJobStatus
  started_at?: string
  finished_at?: string | null
  output_path?: string | null
  file_size?: number | null
  error?: string | null
}

// ============= 操作请求 =============

/** POST /api/items/{id}/confirm 请求体 */
export interface ConfirmRequest {
  primary_file_id?: string | null
}

/** POST /api/items/{id}/reject 请求体 */
export interface RejectRequest {
  note: string
}

/** POST /api/projects/{id}/items 请求体 */
export interface ItemCreateRequest {
  name: string
  description?: string | null
  pages?: number | null
}

/** PATCH /api/items/{id} 请求体 — 不含 status */
export interface ItemUpdateRequest {
  name?: string
  description?: string | null
  pages?: number | null
}

// ============= API 错误 =============

/** 后端 FastAPI 错误响应（统一格式：{ detail, code? }） */
export interface ApiError {
  detail: string
  code?: string
}
