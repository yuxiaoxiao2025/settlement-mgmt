/**
 * SVG 圆环进度条。
 *
 * 用法：
 *   <ProgressRing progress={8} total={25} size={56} />
 *
 * - 颜色按完成度切档：<30% 红（落后）/ 30-80% 蓝（进行中）/ ≥80% 绿（接近完成）
 * - 中心显示 "已确认 / 总数"
 * - 纯 SVG + Tailwind，无外部图标库
 */
import clsx from 'clsx';

export interface ProgressRingProps {
  /** 已完成数（一般指 confirmed） */
  progress: number;
  /** 总数 */
  total: number;
  /** 外径（px），默认 56 */
  size?: number;
  /** 描边宽度（px），默认 size 的 ~12% */
  strokeWidth?: number;
  /** 自定义类名（用于覆盖/外层样式） */
  className?: string;
  /** 显示模式：'ratio' = "8/25"；'percent' = "32%"；默认 'ratio' */
  display?: 'ratio' | 'percent';
}

export function ProgressRing({
  progress,
  total,
  size = 56,
  strokeWidth,
  className,
  display = 'ratio',
}: ProgressRingProps) {
  const safeTotal = Math.max(total, 1); // 防 0 除
  const ratio = Math.max(0, Math.min(1, progress / safeTotal));
  const percent = Math.round(ratio * 100);

  // 颜色档位
  const colorClass =
    percent < 30
      ? 'text-red-500'
      : percent < 80
        ? 'text-blue-500'
        : 'text-green-500';

  // SVG 几何
  const sw = strokeWidth ?? Math.max(4, Math.round(size * 0.12));
  const r = (size - sw) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div
      className={clsx('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`进度 ${progress}/${total}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* 背景环 */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={sw}
          className="text-gray-200"
          stroke="currentColor"
        />
        {/* 进度环 */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={clsx(colorClass, 'transition-[stroke-dashoffset] duration-500')}
          stroke="currentColor"
        />
      </svg>

      {/* 中心文字 */}
      <div
        className={clsx(
          'absolute inset-0 flex items-center justify-center',
          'font-semibold tabular-nums',
          size >= 64 ? 'text-sm' : 'text-xs',
          colorClass,
        )}
      >
        {display === 'percent' ? `${percent}%` : `${progress}/${total}`}
      </div>
    </div>
  );
}