/**
 * 资料项状态机决策 —— T-06 状态机纯函数。
 *
 * 抽出来便于单测（避免引入 jsdom / @testing-library 测 React 组件）。
 * ItemRow 调用 getItemActions(item.status) 决定哪些按钮显示。
 */

export type ItemStatus = 'pending' | 'uploaded' | 'confirmed' | 'rejected';

export interface ItemActions {
  showUpload: boolean;     // 行级「上传」按钮
  showConfirm: boolean;    // 复核
  showReject: boolean;     // 驳回
  showReset: boolean;      // 重置
}

/**
 * 根据 item.status 决定 ItemRow 显示哪些操作按钮。
 *
 * 状态机（SPEC §2.1）：
 * - pending: 等待文件 → 显示「上传」
 * - uploaded: 已上传 → 显示「复核」「驳回」
 * - rejected: 已驳回 → 显示「上传」「重置」
 * - confirmed: 已确认 → 显示「重置」（admin 强制重置；业务上不可回退）
 */
export function getItemActions(status: ItemStatus): ItemActions {
  switch (status) {
    case 'pending':
      return { showUpload: true, showConfirm: false, showReject: false, showReset: false };
    case 'uploaded':
      return { showUpload: false, showConfirm: true, showReject: true, showReset: false };
    case 'rejected':
      return { showUpload: true, showConfirm: false, showReject: false, showReset: true };
    case 'confirmed':
      return { showUpload: false, showConfirm: false, showReject: false, showReset: true };
    default:
      // unknown status: 安全兜底 — 不显示任何按钮
      return { showUpload: false, showConfirm: false, showReject: false, showReset: false };
  }
}
