/**
 *未认领文件区 ——SPEC-FW-6 / SPEC-UI-5。
 *
 * 当文件被拖到项目根目录且模糊匹配失败时，会进入 _unclaimed/暂存区；
 * 后端 GET /api/projects/{id}/items 返回的 `unclaimed`字段就是这堆文件。
 *
 * 当前 UI 提供：列表展示 + 「刷新」按钮 + 「指派给某项」下拉。
 *真实指派端点（POST /api/items/{id}/files/{file_id}/assign）后端未实现，
 *暂以"刷新此 item 子文件夹" +提示用户把文件手动移到对应子目录来兜底。
 */
import { useState } from 'react';
import type { FileInfo, Item } from '../types';
import { formatFileSize, formatDateTime } from '../lib/format';
import { downloadFile, previewFileUrl, refreshItem } from '../api/files';

interface UnclaimedFilesProps {
 files: FileInfo[];
 /** 项目下所有 item（用于指派下拉选项） */
 items: Item[];
 /**任意操作成功后回调（父组件触发 invalidate） */
 onChanged?: () => void;
}

export function UnclaimedFiles({ files, items, onChanged }: UnclaimedFilesProps) {
 const [assignTarget, setAssignTarget] = useState<Record<string, string>>({});
 const [busy, setBusy] = useState<string | null>(null);
 const [hint, setHint] = useState<string | null>(null);

 if (files.length ===0) {
 return (
 <section className="border-t pt-4 mt-6">
 <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
 <span aria-hidden>📦</span>
 待认领文件
 </h2>
 <p className="text-sm text-gray-400 italic mt-2">暂无待认领文件</p>
 </section>
 );
 }

 async function handleAssign(fileId: string) {
 const itemId = assignTarget[fileId];
 if (!itemId) return;
 setBusy(fileId);
 setHint(null);
 try {
 await refreshItem(itemId);
 setHint(
 `已触发 ${findItemName(items, itemId)} 的目录扫描。请把文件移动到对应子文件夹以便 watcher接管。`,
 );
 onChanged?.();
 } catch (e) {
 setHint(`操作失败：${e instanceof Error ? e.message : String(e)}`);
 } finally {
 setBusy(null);
 }
 }

 return (
 <section className="border-t pt-4 mt-6">
 <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
 <span aria-hidden>📦</span>
 待认领文件
 <span className="text-xs text-gray-400 font-normal">（{files.length} 个）</span>
 </h2>

 {hint && (
 <div className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
 {hint}
 </div>
 )}

 <ul className="mt-3 space-y-2">
 {files.map((f) => (
 <li
 key={f.id}
 className="flex items-center gap-3 py-2 px-3 bg-yellow-50 border border-yellow-200 rounded text-sm"
 >
 <div className="flex-1 min-w-0">
 <div className="font-medium text-gray-800 truncate" title={f.filename}>
 {f.filename}
 </div>
 <div className="text-xs text-gray-500 mt-0.5">
 {formatFileSize(f.filesize)} · {formatDateTime(f.uploaded_at)}
 </div>
 </div>

 {/* 操作：预览/下载 */}
 <button
 type="button"
 onClick={() => window.open(previewFileUrl(f.id), '_blank', 'noopener,noreferrer')}
 className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 rounded"
 >
预览
 </button>
 <button
 type="button"
 onClick={() => downloadFile(f.id, f.filename)}
 className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 rounded"
 >
 下载
 </button>

 {/* 指派下拉 */}
 <select
 value={assignTarget[f.id] ?? ''}
 onChange={(e) =>
 setAssignTarget((prev) => ({ ...prev, [f.id]: e.target.value }))
 }
 disabled={busy === f.id}
 className="px-2 py-1 text-xs border border-gray-300 rounded bg-white max-w-[200px]"
 >
 <option value="">指派给某项…</option>
 {items.map((it) => (
 <option key={it.id} value={it.id}>
 {String(it.seq).padStart(2, '0')}·{it.name}
 </option>
 ))}
 </select>
 <button
 type="button"
 onClick={() => handleAssign(f.id)}
 disabled={busy === f.id || !assignTarget[f.id]}
 className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
 >
 指派
 </button>
 </li>
 ))}
 </ul>
 </section>
 );
}

function findItemName(items: Item[], itemId: string): string {
 const it = items.find((i) => i.id === itemId);
 return it ? `「${it.name}」` : '该项';
}
