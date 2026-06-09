/**
 * 模版管理页（/template）。
 *
 * 功能：
 *   1. 拉取全局模版（GET /api/template）→ 列表展示所有项
 *   2. 「推广新项到全局」表单（POST /api/template/items）
 *      - 触发场景：用户在 ProjectDetail 新增项时，后端返回 promote_available 提示；
 *        用户点击确认后，由 ProjectDetail 调用此接口（或后端单独触发）。
 *      - 此页面也提供入口，让管理员可手动添加模版项（应急场景）。
 *
 * 展示字段（来自 TemplateItem + master_template.json）：
 *   - seq / name / description / is_default
 *
 * UI 布局：
 *   - 顶部：标题 + 当前模版版本号
 *   - 左主区：25+ 项列表（序号 + 名称 + 描述 + 默认/扩展徽章）
 *   - 右下：「添加新模版项」卡片（折叠面板，默认收起避免误操作）
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Plus } from 'lucide-react';
import clsx from 'clsx';
import { getTemplate, promoteItem } from '../api/template';
import { useAppStore } from '../store/app';
import type { Template, TemplateItem } from '../types';

export default function TemplateManager() {
  const pushToast = useAppStore((s) => s.pushToast);

  // 数据
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 添加表单
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 拉取
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getTemplate();
      setTemplate(t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      pushToast('error', `加载模版失败：${msg}`);
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 提交新项
  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = newName.trim();
      if (!name) {
        pushToast('error', '请填写资料名称');
        return;
      }
      setSubmitting(true);
      try {
        const result = await promoteItem({
          name,
          description: newDesc.trim() || null,
        });
        if (result.added) {
          pushToast(
            'success',
            `已添加「${name}」到全局模版（v${result.new_version}，共 ${result.total_items} 项）`,
          );
          setNewName('');
          setNewDesc('');
          setShowForm(false);
          await reload();
        } else {
          pushToast('info', `「${name}」已存在于模版中，无需重复添加`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('error', `添加失败：${msg}`);
      } finally {
        setSubmitting(false);
      }
    },
    [newName, newDesc, pushToast, reload],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">模版管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          管理「项目结算资料交接清单」全局模版。下次创建项目时，将按此模版初始化资料项。
        </p>
      </header>

      {/* 错误状态 */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 概览 */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FileText className="h-4 w-4 text-gray-400" />
          <span>
            当前版本：<span className="font-semibold text-gray-900">v{template?.version ?? '?'}</span>
          </span>
          <span className="mx-1 text-gray-300">·</span>
          <span>
            共 <span className="font-semibold text-gray-900">{template?.items.length ?? 0}</span> 项
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? '收起表单' : '添加新项'}
        </button>
      </div>

      {/* 添加表单（折叠） */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-blue-200 bg-blue-50/30 p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            推广新项到全局模版
          </h2>
          <div className="space-y-3">
            <Field label="资料名称" required>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={200}
                placeholder="例如：BIM 模型"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={submitting}
              />
            </Field>
            <Field label="描述（可选）">
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={500}
                placeholder="例如：项目 BIM 三维模型文件"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={submitting}
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={submitting}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !newName.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {submitting ? '提交中…' : '确认添加'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            提示：通常由 ProjectDetail 页在新增项时询问是否推广，此处为管理员应急入口。
          </p>
        </form>
      )}

      {/* 列表 */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">加载中…</div>
        ) : !template || template.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">模版为空</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {template.items.map((item) => (
              <TemplateItemRow key={item.seq} item={item} />
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-400">
        「默认」表示来自标准交接清单；「扩展」表示某项目历史上添加的非标项（保留在模版中）。
      </p>
    </div>
  );
}

// ============ 子组件 ============

function TemplateItemRow({ item }: { item: TemplateItem }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
      <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-gray-400">
        {String(item.seq).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{item.name}</span>
          <span
            className={clsx(
              'rounded px-1.5 py-0.5 text-[10px] font-medium',
              item.is_default
                ? 'bg-green-100 text-green-700'
                : 'bg-purple-100 text-purple-700',
            )}
          >
            {item.is_default ? '默认' : '扩展'}
          </span>
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
        )}
      </div>
    </li>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}