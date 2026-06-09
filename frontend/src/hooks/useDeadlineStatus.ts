/**
 *截止日期倒计时 hook +颜色映射。
 *
 * SPEC §7.2 / §11剧本4：
 * - days_to_deadline >3：正常（绿/灰）
 * - days_to_deadline ∈ (0,3]：紧急（橙）
 * - days_to_deadline ≤0：已逾期（红）
 *
 * 使用方式：
 * const { daysToDeadline, color, label, isUrgent, isOverdue } = useDeadlineStatus(project.deadline);
 */
import { useMemo } from 'react';
import type { Project } from '../types';

export type DeadlineTone = 'normal' | 'urgent' | 'overdue';

export interface DeadlineStatus {
 /** 服务器计算的剩余天数（可负） */
 daysToDeadline: number;
 /**文本标签：还剩 N 天 / 今天截止 / 已逾期 N 天 */
 label: string;
 /** Tailwind颜色类 */
 color: string;
 /**背景颜色类（用于卡片背景） */
 bgColor: string;
 /**边框颜色类 */
 borderColor: string;
 tone: DeadlineTone;
 isUrgent: boolean;
 isOverdue: boolean;
}

/**
 * 根据 deadline字符串（ISO date）计算倒计时状态。
 * 后端 Project.days_to_deadline字段已经在响应里，优先使用；
 * 若传入 null/undefined 则 fallback 到本地计算。
 */
export function useDeadlineStatus(
 deadline: string | null | undefined,
 serverDays?: number | null,
): DeadlineStatus {
 return useMemo(() => {
 const days =
 typeof serverDays === 'number'
 ? serverDays
 : computeDaysToDeadline(deadline ?? null);

 if (days >3) {
 return {
 daysToDeadline: days,
 label: `还剩 ${days} 天`,
 color: 'text-gray-700',
 bgColor: 'bg-gray-50',
 borderColor: 'border-gray-200',
 tone: 'normal',
 isUrgent: false,
 isOverdue: false,
 };
 }

 if (days >0) {
 return {
 daysToDeadline: days,
 label: `还剩 ${days} 天`,
 color: 'text-orange-700',
 bgColor: 'bg-orange-50',
 borderColor: 'border-orange-400',
 tone: 'urgent',
 isUrgent: true,
 isOverdue: false,
 };
 }

 if (days ===0) {
 return {
 daysToDeadline:0,
 label: '今天截止',
 color: 'text-red-700',
 bgColor: 'bg-red-50',
 borderColor: 'border-red-500',
 tone: 'urgent',
 isUrgent: true,
 isOverdue: false,
 };
 }

 // days <0
 const overdue = Math.abs(days);
 return {
 daysToDeadline: days,
 label: `已逾期 ${overdue} 天`,
 color: 'text-red-800',
 bgColor: 'bg-red-100',
 borderColor: 'border-red-600',
 tone: 'overdue',
 isUrgent: false,
 isOverdue: true,
 };
 }, [deadline, serverDays]);
}

/**便捷 hook：直接从 Project 对象读取 deadline + days_to_deadline */
export function useProjectDeadline(project: Project | null | undefined): DeadlineStatus {
 return useDeadlineStatus(project?.deadline ?? null, project?.days_to_deadline ?? null);
}

/**
 *纯函数：把 ISO date字符串解析成剩余天数（向下取整）。
 * 与后端 project_service.days_to_deadline()行为一致：基于 UTC00:00 之差。
 */
export function computeDaysToDeadline(deadline: string | null): number {
 if (!deadline) return Number.POSITIVE_INFINITY;
 const d = new Date(deadline);
 if (isNaN(d.getTime())) return Number.POSITIVE_INFINITY;

 const now = new Date();
 // 把 today归零到00:00（本地时区，与后端中文项目一致）
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

 const diffMs = target.getTime() - today.getTime();
 return Math.floor(diffMs / (1000 *60 *60 *24));
}
