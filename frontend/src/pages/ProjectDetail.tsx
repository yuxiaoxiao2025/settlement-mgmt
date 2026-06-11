/**
 *项目详情主页面 ——核心页面。
 *
 * SPEC-UI-3 + SPEC §11剧本1：
 * -头部：项目元信息 +截止倒计时 +进度（X/25 已确认）
 * -主体：25 行 ItemRow（用 TanStack Query3s轮询；5s 内必显示新增文件）
 * -底部：未认领文件区 + 「生成结算书」按钮
 *
 *路由：/projects/:id（CONTEXT-04 §4）
 *依赖：useItems（拉资料项 + 未认领文件）+ useProjectDeadline + 项目元信息（fetch）
 */
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Archive } from 'lucide-react';
import { useProjectDeadline } from '../hooks/useDeadlineStatus';
import {
 useConfirmItem,
 useItems,
 useRejectItem,
 useResetItem,
} from '../hooks/useItems';
import { useArchiveProject, useProject } from '@/hooks/useProjects';
import { ItemRow } from '../components/ItemRow';
import { StatusBadge } from '../components/StatusBadge';
import { UnclaimedFiles } from '../components/UnclaimedFiles';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAppStore } from '@/store/app';
import { formatDate } from '../lib/format';
import type { Project } from '../types';

function ProjectDetail() {
 const { id = '' } = useParams<{ id: string }>();

 //资料项 + 未认领文件（3s轮询）
 const itemsQuery = useItems(id);
 // 项目元信息（5s轮询，弱于 items的轮询）
 const projectQuery = useProject(id);

 const confirmMut = useConfirmItem(id);
 const rejectMut = useRejectItem(id);
 const resetMut = useResetItem(id);
 const archiveMut = useArchiveProject();
 const pushToast = useAppStore((s) => s.pushToast);
 const [showArchiveModal, setShowArchiveModal] = useState(false);
 const [archiveError, setArchiveError] = useState<string | null>(null);

 const isMutating =
 confirmMut.isPending || rejectMut.isPending || resetMut.isPending;

 const items = itemsQuery.data?.items ?? [];
 const unclaimed = itemsQuery.data?.unclaimed ?? [];
 const project = projectQuery.data ?? null;
 const deadlineStatus = useProjectDeadline(project);

 if (itemsQuery.isLoading && !itemsQuery.data) {
 return <PageSkeleton text="加载资料项..." />;
 }

 if (itemsQuery.error) {
 return (
 <ErrorPanel
 title="加载资料项失败"
 message={itemsQuery.error instanceof Error ? itemsQuery.error.message : String(itemsQuery.error)}
 onRetry={() => itemsQuery.refetch()}
 />
 );
 }

 if (!project) {
 return (
 <ErrorPanel
 title="加载项目失败"
 message={projectQuery.error?.message ?? '未找到此项目'}
 onRetry={() => projectQuery.refetch()}
 />
 );
 }

 const progress = project.progress;
 const totalCount = progress.total;
 const isArchived = project.status === 'archived';

 // 「生成结算书」按钮：所有项 MUST confirmed
 const allConfirmed =
 progress.confirmed === totalCount && totalCount >0;

 // 归档操作
 const handleArchive = async () => {
  setArchiveError(null);
  try {
   await archiveMut.mutateAsync(id);
   setShowArchiveModal(false);
   pushToast('success', '项目已归档');
  } catch (e) {
   const msg = e instanceof Error ? e.message : '归档失败';
   setArchiveError(msg);
   pushToast('error', `归档失败：${msg}`);
  }
 };

 return (
 <div className="max-w-6xl mx-auto px-4 py-6">
 {/* =============顶部：项目元信息 +倒计时 ============= */}
 <header
 className={`rounded-lg border-2 p-5 mb-6 ${deadlineStatus.bgColor} ${deadlineStatus.borderColor}`}
 >
 <div className="flex items-start justify-between gap-4 flex-wrap">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
 <span
 className={`text-xs px-2 py-0.5 rounded ${
 project.status === 'archived'
 ? 'bg-gray-200 text-gray-700'
 : 'bg-blue-100 text-blue-700'
 }`}
 >
 {project.status === 'archived' ? '已归档' : '进行中'}
 </span>
 </div>
 <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-700">
 <Field label="移交日期" value={formatDate(project.handover_date)} />
 <Field label="截止日期" value={formatDate(project.deadline)} highlight />
 <Field label="建设管理单位" value={project.construction_unit} />
 <Field label="移交人" value={project.handover_person} />
 <Field label="接收单位" value={project.receiving_unit} />
 <Field label="接收人" value={project.receiving_person} />
 </div>
 </div>

 {/*倒计时 +进度 */}
 <div className="text-right flex-shrink-0">
 <div className={`text-3xl font-bold ${deadlineStatus.color}`}>
 {deadlineStatus.label}
 </div>
 <div className="mt-2 text-sm text-gray-600">
进度：<span className="font-mono font-bold">{progress.confirmed}</span> / {totalCount} 已确认
 </div>
 <div className="mt-1 text-xs text-gray-500 flex gap-2 justify-end flex-wrap">
 <MiniStat color="green" value={progress.confirmed} label="已确认" />
 <MiniStat color="blue" value={progress.uploaded} label="已上传" />
 <MiniStat color="red" value={progress.rejected} label="已驳回" />
 <MiniStat color="gray" value={progress.pending} label="待上传" />
 </div>
 </div>
 </div>

{/* 操作按钮 */}
<div className="mt-4 flex gap-2 flex-wrap">
<Link
to={`/projects/${id}/edit`}
className={`px-3 py-1.5 text-sm border border-gray-300 rounded ${
isArchived ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:bg-white'
}`}
aria-disabled={isArchived}
title={isArchived ? '归档项目不可编辑' : '编辑项目元信息'}
>
编辑元信息
</Link>
<button
type="button"
onClick={() => itemsQuery.refetch()}
disabled={itemsQuery.isFetching}
className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-50"
>
{itemsQuery.isFetching ? '刷新中...' : '手动刷新'}
</button>
<Link
to={`/projects/${id}/settlement`}
className={`px-3 py-1.5 text-sm rounded font-medium ${
allConfirmed
? 'bg-blue-600 text-white hover:bg-blue-700'
: 'bg-gray-200 text-gray-500 cursor-not-allowed'
}`}
aria-disabled={!allConfirmed}
onClick={(e) => {
if (!allConfirmed) e.preventDefault();
}}
title={
allConfirmed
? '前往结算书生成页'
: '所有资料项 MUST 已确认后才能生成结算书'
}
>
生成结算书
</Link>
{/* 归档按钮：未归档 + 全部已确认时可用 */}
{!isArchived && (
<button
type="button"
onClick={() => {
setArchiveError(null);
setShowArchiveModal(true);
}}
disabled={!allConfirmed}
className={`px-3 py-1.5 text-sm rounded font-medium inline-flex items-center gap-1.5 ${
allConfirmed
? 'bg-amber-600 text-white hover:bg-amber-700'
: 'bg-gray-200 text-gray-500 cursor-not-allowed'
}`}
title={
allConfirmed
? '归档后项目将变为只读，不可再编辑/驳回/确认'
: '所有资料项确认后才能归档'
}
>
<Archive className="h-3.5 w-3.5" />
归档项目
</button>
)}
</div>
</header>

{/* 归档确认弹窗 */}
{showArchiveModal && (
<ConfirmModal
title="归档项目？"
description={
archiveError
? `归档失败：${archiveError}`
: '归档后项目进入只读状态：不可编辑、不可驳回/确认/重置资料项、不可删除。归档动作不可撤销，但可在后续版本中解除归档。'
}
confirmLabel="确认归档"
matchKeyword="归档"
tone="primary"
loading={archiveMut.isPending}
onClose={() => !archiveMut.isPending && setShowArchiveModal(false)}
onConfirm={handleArchive}
/>
)}

 {/* =============主体：25 行 ItemRow ============= */}
 <section>
 <div className="flex items-center justify-between mb-2">
 <h2 className="text-base font-semibold text-gray-800">
资料清单（{items.length} / {totalCount}）
 </h2>
 {/*轮询状态指示（开发时方便肉眼确认） */}
 <span className="text-xs text-gray-400">
 {itemsQuery.isFetching ? '轮询中...' : '已同步'}
 </span>
 </div>

 {items.length ===0 ? (
 <div className="text-sm text-gray-500 italic py-8 text-center border rounded">
暂无资料项
 </div>
 ) : (
 <div className="border rounded-lg bg-white">
 {items.map((item) => (
 <ItemRow
 key={item.id}
 item={item}
 onConfirm={(itemId) => confirmMut.mutate({ itemId })}
 onReject={(itemId, note) => rejectMut.mutate({ itemId, note })}
 onReset={(itemId) => resetMut.mutate(itemId)}
 onRefresh={() => itemsQuery.refetch()}
 disabled={isMutating}
 />
 ))}
 </div>
 )}

 {/* Mutation错误提示 */}
 {(confirmMut.error || rejectMut.error || resetMut.error) && (
 <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
 操作失败：
 {confirmMut.error?.message ?? rejectMut.error?.message ?? resetMut.error?.message}
 </div>
 )}
 </section>

 {/* ============= 未认领文件 ============= */}
 <UnclaimedFiles
 files={unclaimed}
 items={items}
 onChanged={() => itemsQuery.refetch()}
 />

 {/*调试信息（开发时显示，生产可关） */}
 {import.meta.env.DEV && (
 <details className="mt-6 text-xs text-gray-400">
 <summary>调试信息</summary>
 <pre className="mt-2 bg-gray-50 p-2 rounded overflow-auto">
 {JSON.stringify(
 {
 itemStatusCount: countByStatus(items),
 polling: {
 items: itemsQuery.dataUpdatedAt,
 project: projectQuery.dataUpdatedAt,
 },
 },
 null,
2,
 )}
 </pre>
 </details>
 )}
 </div>
 );
}

// ===== helpers =====

interface FieldProps {
 label: string;
 value: string | null | undefined;
 highlight?: boolean;
}

function Field({ label, value, highlight = false }: FieldProps) {
 return (
 <div>
 <span className="text-gray-500">{label}：</span>
 <span className={highlight ? 'font-medium text-gray-900' : 'text-gray-700'}>
 {value || '—'}
 </span>
 </div>
 );
}

interface MiniStatProps {
 color: 'green' | 'blue' | 'red' | 'gray';
 value: number;
 label: string;
}

function MiniStat({ color, value, label }: MiniStatProps) {
 const palette: Record<MiniStatProps['color'], string> = {
 green: 'bg-green-100 text-green-700',
 blue: 'bg-blue-100 text-blue-700',
 red: 'bg-red-100 text-red-700',
 gray: 'bg-gray-100 text-gray-600',
 };
 return (
 <span className={`px-1.5 py-0.5 rounded ${palette[color]}`}>
 {value} {label}
 </span>
 );
}

function PageSkeleton({ text }: { text: string }) {
 return (
 <div className="max-w-6xl mx-auto px-4 py-12 text-center text-gray-400">{text}</div>
 );
}

interface ErrorPanelProps {
 title: string;
 message: string;
 onRetry: () => void;
}

function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
 return (
 <div className="max-w-6xl mx-auto px-4 py-12">
 <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
 <h2 className="text-lg font-semibold text-red-700 mb-2">{title}</h2>
 <p className="text-sm text-red-600 mb-4">{message}</p>
 <button
 type="button"
 onClick={onRetry}
 className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
 >
 重试
 </button>
 </div>
 </div>
 );
}

function countByStatus(items: { status: string }[]) {
 const c: Record<string, number> = { pending:0, uploaded:0, confirmed:0, rejected:0 };
 items.forEach((i) => {
 c[i.status] = (c[i.status] ??0) +1;
 });
 return c;
}

/**
 * 修 I-key (REVIEW-TRACK1 I2 / REVIEW-TRACK3 I-key)：
 * 之前 ProjectDetail 自定义 useProject 用 ['project', id]，
 * 与 useProjects.ts 里的 projectKeys.byId(id) 不匹配，
 * 导致 mutations invalidate 一个 key、轮询用另一个 key，
 * 出现"mutation 成功但 UI 不刷"的最坏情况。
 * 现在统一使用 useProjects.ts 里的 useProject + projectKeys.byId。
 */

export default ProjectDetail;
