/**
 *状态徽章 ——复用 T-FE-A 的 src/lib/status.ts 的颜色 + 图标配置。
 *
 * 只做一个轻量包装组件，让消费方只 import组件、不用关心底色和 emoji。
 *真正的"颜色+图标+label"映射在 status.ts（CONTEXT-04 §3）。
 */
import type { ItemStatus } from '../types';
import { getItemStatusStyle } from '../lib/status';

interface StatusBadgeProps {
 status: ItemStatus;
 /** 显示尺寸 */
 size?: 'sm' | 'md';
 /** 自定义 class */
 className?: string;
}

export function StatusBadge({ status, size = 'sm', className = '' }: StatusBadgeProps) {
 const meta = getItemStatusStyle(status);

 const sizeClasses =
 size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

 return (
 <span
 className={`inline-flex items-center gap-1 rounded-full font-medium ${meta.bg} ${meta.color} ${sizeClasses} ${className}`}
 title={meta.label}
 aria-label={`状态：${meta.label}`}
 >
 <span aria-hidden>{meta.icon}</span>
 <span>{meta.label}</span>
 </span>
 );
}
