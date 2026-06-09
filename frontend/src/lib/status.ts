/**
 * 状态颜色 + 图标 + 标签映射（CONTEXT-04 §3 + SPEC §7.2）
 *
 * 颜色映射（Tailwind class）：
 *   pending   → gray
 *   uploaded  → blue
 *   confirmed → green
 *   rejected  → red
 *
 * 字段命名约定（与 T-FE-C 的 StatusBadge.tsx 对齐）：
 *   ItemStatusStyle  用 { color, bg, label, icon }
 *
 * 同时导出 DeadlineTone 的样式 class（format.ts 的 DeadlineFormat 引用）。
 * 截止日期倒计时的档位：
 *   urgent  ≤3 天（红）/ soon  4-7 天（橙）/ normal >7 天（灰）
 *   overdue <0  天（深红）/ done  已归档（灰）
 */

import type {
  ItemStatus,
  ProjectStatus,
  SettlementJobStatus,
} from '@/types'

// ============= ItemStatus 样式 =============
//
// ⚠️ 字段名 { color, bg, label, icon } 是与 T-FE-C 的 StatusBadge.tsx 共享的契约，
// 任何字段重命名 MUST 同步更新 StatusBadge.tsx。

export interface ItemStatusStyle {
  /** Tailwind 文字色 class — T-FE-C 的 StatusBadge 读此字段 */
  color: string
  /** Tailwind 背景色 class（浅色） */
  bg: string
  /** 文字 label（中文） */
  label: string
  /** emoji 图标 */
  icon: string
}

export const ITEM_STATUS: Record<ItemStatus, ItemStatusStyle> = {
  pending: {
    color: 'text-gray-600',
    bg: 'bg-gray-100',
    label: '未开始',
    icon: '⚪',
  },
  uploaded: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    label: '已上传',
    icon: '📄',
  },
  confirmed: {
    color: 'text-green-700',
    bg: 'bg-green-50',
    label: '已确认',
    icon: '✅',
  },
  rejected: {
    color: 'text-red-700',
    bg: 'bg-red-50',
    label: '已驳回',
    icon: '❌',
  },
}

export function getItemStatusStyle(status: ItemStatus): ItemStatusStyle {
  return ITEM_STATUS[status] ?? ITEM_STATUS.pending
}

/** 全部 ItemStatus 列表（顺序固定，给测试/排序用） */
export const ITEM_STATUS_LIST: ItemStatus[] = [
  'pending',
  'uploaded',
  'confirmed',
  'rejected',
]

// ============= ProjectStatus 样式 =============

export const PROJECT_STATUS: Record<ProjectStatus, ItemStatusStyle> = {
  active: {
    color: 'text-green-700',
    bg: 'bg-green-50',
    label: '进行中',
    icon: '🟢',
  },
  archived: {
    color: 'text-gray-500',
    bg: 'bg-gray-100',
    label: '已归档',
    icon: '📦',
  },
}

export function getProjectStatusStyle(status: ProjectStatus): ItemStatusStyle {
  return PROJECT_STATUS[status] ?? PROJECT_STATUS.active
}

// ============= SettlementJobStatus 样式 =============

export const SETTLEMENT_STATUS: Record<SettlementJobStatus, ItemStatusStyle> = {
  idle: {
    color: 'text-gray-500',
    bg: 'bg-gray-100',
    label: '尚未生成',
    icon: '○',
  },
  running: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    label: '生成中',
    icon: '⏳',
  },
  success: {
    color: 'text-green-700',
    bg: 'bg-green-50',
    label: '已生成',
    icon: '✅',
  },
  failed: {
    color: 'text-red-700',
    bg: 'bg-red-50',
    label: '失败',
    icon: '❌',
  },
}

export function getSettlementStatusStyle(
  status: SettlementJobStatus,
): ItemStatusStyle {
  return SETTLEMENT_STATUS[status] ?? SETTLEMENT_STATUS.idle
}

// ============= DeadlineTone 样式 =============

export type DeadlineTone = 'urgent' | 'soon' | 'normal' | 'overdue' | 'done'

export interface DeadlineToneStyle {
  /** 文字色 class */
  text: string
  /** 边框色 class */
  border: string
  /** 背景色 class */
  bg: string
}

export const DEADLINE_TONE_CLASS: Record<DeadlineTone, DeadlineToneStyle> = {
  urgent: {
    text: 'text-red-600',
    border: 'border-red-400',
    bg: 'bg-red-50',
  },
  soon: {
    text: 'text-orange-600',
    border: 'border-orange-300',
    bg: 'bg-orange-50',
  },
  normal: {
    text: 'text-gray-600',
    border: 'border-gray-300',
    bg: 'bg-white',
  },
  overdue: {
    text: 'text-red-700',
    border: 'border-red-500',
    bg: 'bg-red-100',
  },
  done: {
    text: 'text-gray-500',
    border: 'border-gray-300',
    bg: 'bg-gray-100',
  },
}
