/**
 * 格式化工具 — 日期 / 时间 / 文件大小 / 倒计时
 *
 * 所有函数都是纯函数，便于 T-FE-B/C 直接 import 使用与单测。
 */

/** 格式化日期为 YYYY-MM-DD；空值/无效 → '—' */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 格式化日期时间为 YYYY-MM-DD HH:mm */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const date = formatDate(d)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${date} ${hh}:${mm}`
}

/** 人类可读的文件大小 — B / KB / MB / GB */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 截止日期倒计时文案 + tone
 *
 * SPEC §7.2 + §11 剧本 4：
 *   - 已归档            → 'done'（灰）
 *   - 已逾期（< 0 天）  → 'overdue'（深红）
 *   - 今日截止（= 0）   → 'urgent'（红）
 *   - ≤ 3 天            → 'urgent'（红）
 *   - 4-7 天            → 'soon'（橙）
 *   - > 7 天            → 'normal'（灰）
 */
export type DeadlineTone = 'urgent' | 'soon' | 'normal' | 'overdue' | 'done'

export interface DeadlineFormat {
  tone: DeadlineTone
  text: string
}

export function formatDeadline(
  deadline: string | Date,
  daysToDeadline: number,
  isArchived = false,
): DeadlineFormat {
  if (isArchived) {
    return { tone: 'done', text: '已归档' }
  }
  if (daysToDeadline < 0) {
    return { tone: 'overdue', text: `已逾期 ${Math.abs(daysToDeadline)} 天` }
  }
  if (daysToDeadline === 0) {
    return { tone: 'urgent', text: '今日截止' }
  }
  if (daysToDeadline <= 3) {
    return { tone: 'urgent', text: `还剩 ${daysToDeadline} 天` }
  }
  if (daysToDeadline <= 7) {
    return { tone: 'soon', text: `还剩 ${daysToDeadline} 天` }
  }
  return { tone: 'normal', text: `还剩 ${daysToDeadline} 天` }
}

/** 简易相对时间（"刚刚" / "X 分钟前" / "X 小时前" / 日期） */
export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  return formatDate(d)
}

/** 把空字符串归一为 null — 给表单提交用 */
export function emptyToNull(v: string): string | null {
  return v && v.trim() ? v.trim() : null
}

/** 把 null/undefined 归一为空串 — 给表单回显用 */
export function nullToEmpty(v: string | null | undefined): string {
  return v == null ? '' : v
}
