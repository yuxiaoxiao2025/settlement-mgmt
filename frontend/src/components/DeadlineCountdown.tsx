/**
 * 截止日期倒计时。
 *
 * 三态显示：
 *  - 今日截止 → "今天截止"（琥珀色）
 *  - 还剩 N 天 → "还剩 N 天"（按天数变档：≤3 红 / ≤7 琥珀 / 其他 灰）
 *  - 已逾期 N 天 → "已逾期 N 天"（红色 + 加粗）
 *
 * 用法：
 *   <DeadlineCountdown daysToDeadline={2} />
 *   <DeadlineCountdown deadline="2026-07-15" />   // 接受 ISO 字符串，自动计算天数
 */
import clsx from 'clsx';

export interface DeadlineCountdownProps {
  /** 距截止日期的天数（负数表示已逾期） */
  daysToDeadline?: number;
  /** ISO 日期字符串，与 daysToDeadline 二选一 */
  deadline?: string;
  /** 自定义类名 */
  className?: string;
}

/** 计算「今天到 ISO 日期」的天数差（含时区修正：取日期的 UTC 午夜）。 */
export function computeDaysToDeadline(iso: string, now: Date = new Date()): number {
  // 把 ISO 字符串或 'YYYY-MM-DD' 转成 UTC 午夜，避免本地时区把 "今天" 算成 "昨天"
  const target = new Date(iso);
  const targetUtc = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  const nowUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const diffMs = targetUtc - nowUtc;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function DeadlineCountdown({
  daysToDeadline: daysProp,
  deadline,
  className,
}: DeadlineCountdownProps) {
  const days =
    typeof daysProp === 'number'
      ? daysProp
      : deadline
        ? computeDaysToDeadline(deadline)
        : 0;

  // 文案 + 颜色档位
  let label: string;
  let colorClass: string;
  let badgeClass: string;

  if (days === 0) {
    label = '今天截止';
    colorClass = 'text-amber-700';
    badgeClass = 'bg-amber-100 text-amber-700 border-amber-300';
  } else if (days > 0 && days <= 3) {
    label = `还剩 ${days} 天`;
    colorClass = 'text-red-600';
    badgeClass = 'bg-red-100 text-red-700 border-red-300';
  } else if (days > 3 && days <= 7) {
    label = `还剩 ${days} 天`;
    colorClass = 'text-amber-600';
    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (days > 7) {
    label = `还剩 ${days} 天`;
    colorClass = 'text-gray-600';
    badgeClass = 'bg-gray-100 text-gray-700 border-gray-200';
  } else {
    // days < 0
    label = `已逾期 ${Math.abs(days)} 天`;
    colorClass = 'text-red-700';
    badgeClass = 'bg-red-100 text-red-800 border-red-400 font-bold';
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5',
        'rounded-md border text-xs',
        badgeClass,
        colorClass,
        className,
      )}
      aria-label={label}
    >
      <ClockIcon className="h-3 w-3" />
      {label}
    </span>
  );
}

// 内联简单钟形图标（避免 lucide 在小尺寸下粗细不一致）
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}