/**
 * 全局应用状态（zustand）。
 *
 * 当前职责：
 *  1. currentProjectId —— 当前打开的项目 ID（供跨页共享，避免每页都重新拉一遍）
 *  2. toast 队列       —— 跨页面通知（成功/错误/信息）
 *
 * 设计原则：
 *  - 只存「跨页面需要共享」的状态。一次性状态（表单值、loading 等）保持在组件本地或 TanStack Query。
 *  - toast 用队列 + 自动消失（4 秒），同时最多展示 3 条（栈式）。
 *  - 类型 + 操作分离：状态在底部，actions 在中间；selectors 导出便于订阅细粒度状态。
 */
import { create } from 'zustand';

/** Toast 种类 */
export type ToastKind = 'success' | 'error' | 'info';

/** 单条 toast */
export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** 创建时间戳（ms），用于判断停留时长 */
  createdAt: number;
}

export interface AppState {
  // ============ state ============
  currentProjectId: string | null;
  toasts: Toast[];

  // ============ actions ============
  setCurrentProjectId: (id: string | null) => void;
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

// toast 自动消失的时长（ms）
const TOAST_DURATION_MS = 4000;
// 同时展示上限
const TOAST_MAX = 3;

/**
 * 主 store hook。
 *
 * 用法：
 *   const projectId = useAppStore(s => s.currentProjectId);
 *   const pushToast = useAppStore(s => s.pushToast);
 *   pushToast('success', '已保存');
 *
 * 注意：pushToast 不需要组件订阅（不会触发重渲）——但 zustand 的 action 引用稳定，
 * 所以拿到一次即可。
 */
export const useAppStore = create<AppState>((set) => ({
  currentProjectId: null,
  toasts: [],

  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  pushToast: (kind, message) => {
    const id =
      // crypto.randomUUID 在现代浏览器中可用；兜底用时间戳
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: Toast = { id, kind, message, createdAt: Date.now() };
    set((state) => ({
      toasts: [...state.toasts, toast].slice(-TOAST_MAX),
    }));

    // 自动消失（用 setTimeout 而非 effect，避免依赖组件挂载）
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, TOAST_DURATION_MS);
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearToasts: () => set({ toasts: [] }),
}));

// ============ selectors ============
// 细粒度订阅，避免组件因无关 state 变化而重渲。

/** 仅取 currentProjectId */
export const selectCurrentProjectId = (s: AppState) => s.currentProjectId;

/** 仅取 toasts（用于 ToastContainer） */
export const selectToasts = (s: AppState) => s.toasts;