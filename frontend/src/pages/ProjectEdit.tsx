/**
 *编辑项目元信息 ——表单提交走 PATCH /api/projects/{id}。
 *
 *归档项目不可编辑（后端422，前端在加载后置灰表单）。
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { Project } from '../types';

interface FormState {
 name: string;
 handover_date: string; // yyyy-mm-dd or ''
 deadline: string; // yyyy-mm-dd
 construction_unit: string;
 handover_person: string;
 receiving_unit: string;
 receiving_person: string;
}

function fromProject(p: Project): FormState {
 return {
 name: p.name ?? '',
 handover_date: p.handover_date ?? '',
 deadline: p.deadline ?? '',
 construction_unit: p.construction_unit ?? '',
 handover_person: p.handover_person ?? '',
 receiving_unit: p.receiving_unit ?? '',
 receiving_person: p.receiving_person ?? '',
 };
}

function ProjectEdit() {
 const { id = '' } = useParams<{ id: string }>();
 const navigate = useNavigate();

 const [form, setForm] = useState<FormState | null>(null);
 const [original, setOriginal] = useState<Project | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [err, setErr] = useState<string | null>(null);

  //加载项目元信息
 useEffect(() => {
 let alive = true;
 setLoading(true);
 apiClient
 .get<Project>(`/projects/${encodeURIComponent(id)}`)
 .then(({ data }) => {
 if (!alive) return;
 setOriginal(data);
 setForm(fromProject(data));
 })
 .catch((e) => {
 if (!alive) return;
 setErr(e?.response?.data?.detail ?? e?.message ?? '加载失败');
 })
 .finally(() => {
 if (alive) setLoading(false);
 });
 return () => {
 alive = false;
 };
 }, [id]);

 function update<K extends keyof FormState>(key: K, value: FormState[K]) {
 setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
 }

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!form) return;
 setErr(null);
 setSaving(true);

 //构造只包含变化字段的 payload
 const payload: Record<string, unknown> = {};
 (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
 const v = form[k];
 if (v === '' || v === null || v === undefined) {
 // Pydantic ProjectUpdate字段都是 Optional；空字符串转 null
 payload[k] = null;
 return;
 }
 if (k === 'handover_date' || k === 'deadline') {
 // 把空字符串转成 null以允许"清除"日期（如果业务允许）
 if (v === '') payload[k] = null;
 else payload[k] = v;
 return;
 }
 payload[k] = v;
 });

 try {
 await apiClient.patch(`/projects/${encodeURIComponent(id)}`, payload);
 navigate(`/projects/${id}`);
 } catch (e: unknown) {
 const ax = e as { response?: { data?: { detail?: string } }; message?: string };
 setErr(ax?.response?.data?.detail ?? ax?.message ?? '保存失败');
 } finally {
 setSaving(false);
 }
 }

 if (loading) {
 return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">加载项目...</div>;
 }

 if (err && !form) {
 return (
 <div className="max-w-2xl mx-auto px-4 py-12">
 <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-700">{err}</div>
 </div>
 );
 }

 if (!form || !original) return null;

 const archived = original.status === 'archived';

 return (
 <div className="max-w-2xl mx-auto px-4 py-6">
 <div className="mb-4">
 <Link to={`/projects/${id}`} className="text-sm text-blue-600 hover:underline">
 ← 返回详情
 </Link>
 </div>

 <h1 className="text-2xl font-bold text-gray-900 mb-1">编辑项目元信息</h1>
 <p className="text-sm text-gray-500 mb-6">仅修改元信息；资料项请在详情页操作。</p>

 {archived && (
 <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-700">
 此项目已归档，无法编辑。请先在详情页取消归档。
 </div>
 )}

 <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
 <Field label="项目名称" required>
 <input
 type="text"
 value={form.name}
 onChange={(e) => update('name', e.target.value)}
 required
 maxLength={200}
 disabled={archived || saving}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
 />
 </Field>

 <div className="grid grid-cols-2 gap-4">
 <Field label="移交日期">
 <input
 type="date"
 value={form.handover_date}
 onChange={(e) => update('handover_date', e.target.value)}
 disabled={archived || saving}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
 />
 </Field>
 <Field label="截止日期" required>
 <input
 type="date"
 value={form.deadline}
 onChange={(e) => update('deadline', e.target.value)}
 required
 disabled={archived || saving}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
 />
 </Field>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <Field label="建设管理单位">
 <input
 type="text"
 value={form.construction_unit}
 onChange={(e) => update('construction_unit', e.target.value)}
 disabled={archived || saving}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
 />
 </Field>
 <Field label="移交人">
 <input
 type="text"
 value={form.handover_person}
 onChange={(e) => update('handover_person', e.target.value)}
 disabled={archived || saving}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
 />
 </Field>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <Field label="接收单位">
 <input
 type="text"
 value={form.receiving_unit}
 onChange={(e) => update('receiving_unit', e.target.value)}
 disabled={archived || saving}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
 />
 </Field>
 <Field label="接收人">
 <input
 type="text"
 value={form.receiving_person}
 onChange={(e) => update('receiving_person', e.target.value)}
 disabled={archived || saving}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
 />
 </Field>
 </div>

 {err && (
 <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
 {err}
 </div>
 )}

 <div className="flex gap-2 justify-end pt-2">
 <Link
 to={`/projects/${id}`}
 className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
 >
取消
 </Link>
 <button
 type="submit"
 disabled={archived || saving}
 className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
 >
 {saving ? '保存中...' : '保存'}
 </button>
 </div>
 </form>
 </div>
 );
}

function Field({
 label,
 required = false,
 children,
}: {
 label: string;
 required?: boolean;
 children: React.ReactNode;
}) {
 return (
 <label className="block">
 <span className="text-sm font-medium text-gray-700 mb-1 block">
 {label}
 {required && <span className="text-red-500 ml-0.5">*</span>}
 </span>
 {children}
 </label>
 );
}

export default ProjectEdit;
