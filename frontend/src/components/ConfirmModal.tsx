/**
 * ConfirmModal —— 二次确认弹窗（危险操作专用）。
 *
 * 设计（DESIGN §11 二次确认规范）：
 *   1. 主按钮初始禁用
 *   2. 用户必须输入项目名（或指定关键词）才能激活主按钮
 *   3. 主按钮文案是动作名（如"删除"），而不是"确定"——降低误点概率
 *   4. 危险操作主按钮用红色
 *
 * 适用场景：删除项目、清空所有文件、解除归档等。
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmModalProps {
  /** 弹窗标题 */
  title: string;
  /** 描述（说明后果） */
  description: string;
  /** 主按钮文案（如"删除"） */
  confirmLabel: string;
  /** 取消按钮文案，默认"取消" */
  cancelLabel?: string;
  /** 用户必须输入的关键词（一般是项目名） */
  matchKeyword: string;
  /** 主按钮色调 */
  tone?: 'danger' | 'primary';
  /** 关闭弹窗（取消或 ESC） */
  onClose: () => void;
  /** 确认回调 */
  onConfirm: () => void | Promise<void>;
  /** 是否正在执行中（按钮显示 spinner，禁用） */
  loading?: boolean;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  matchKeyword,
  tone = 'danger',
  onClose,
  onConfirm,
  loading = false,
}: ConfirmModalProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入时聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  const matched = input.trim() === matchKeyword.trim();
  const canSubmit = matched && !loading;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    await onConfirm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleConfirm();
  };

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
      : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* 头部 */}
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`h-5 w-5 shrink-0 ${
                tone === 'danger' ? 'text-red-500' : 'text-blue-500'
              }`}
            />
            <h2
              id="confirm-modal-title"
              className="text-base font-semibold text-gray-900"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容 */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm text-gray-600">{description}</p>
            <p className="text-sm text-gray-700">
              请输入{' '}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-900">
                {matchKeyword}
              </span>{' '}
              以确认：
            </p>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder={matchKeyword}
              autoComplete="off"
            />
          </div>

          {/* 底部 */}
          <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${confirmClass}`}
            >
              {loading ? '处理中…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
