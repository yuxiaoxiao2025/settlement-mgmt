/**
 * 文件列表 ——展示某个 item 下所有已上传文件 +操作按钮（预览/下载/删除/设为主文件）。
 *
 * SPEC-UI-4：每行资料项 MUST 显示已上传文件数；FileList展开后允许逐文件操作。
 *
 * 操作按钮（按"是不是主文件 +是否有其他文件"切换）：
 * -预览 / 下载：所有文件都可点
 * - 删除：所有文件都可点（后端不删物理文件，仅从 files 表移除）
 * - 设为主文件：仅当 is_primary=false 时显示（避免误操作）
 *
 * 注：setPrimaryFile 当前通过 /confirm端点绕行（后端无专用端点），
 * 同时会把 item.status翻为 confirmed —— 此副作用在 UI 上需要提示。
 */
import { useState } from 'react';
import type { FileInfo } from '../types';
import { formatFileSize, formatDateTime } from '../lib/format';
import { deleteFile, downloadFile, downloadFileUrl, setPrimaryFile } from '../api/files';
import { FilePreviewModal } from './FilePreviewModal';

interface FileListProps {
 itemId: string;
 files: FileInfo[];
 /**设为主文件成功后回调（父组件可触发刷新） */
 onChanged?: () => void;
}

export function FileList({ itemId, files, onChanged }: FileListProps) {
 const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);

 if (files.length ===0) {
 return (
 <div className="text-sm text-gray-400 italic py-2 pl-4">
 暂无文件
 </div>
 );
 }

 return (
 <>{/* 预览弹窗（顶部挂载，所有子 file 共享）*/}
 {previewFile && (
 <FilePreviewModal
 previewUrl={`/api/files/${previewFile.id}/preview`}
 downloadUrl={downloadFileUrl(previewFile.id)}
 filename={previewFile.filename}
 isPdf={previewFile.is_pdf}
 onClose={() => setPreviewFile(null)}
 />
 )}
 <ul className="divide-y divide-gray-100 pl-4">
 {files.map((f) => (
 <FileRow
 key={f.id}
 file={f}
 itemId={itemId}
 onChanged={onChanged}
 onPreview={() => setPreviewFile(f)}
 />
 ))}
 </ul>
 </>
 );
 }


function FileRow({
 file,
 itemId,
 onChanged,
 onPreview,
}: {
 file: FileInfo;
 itemId: string;
 onChanged?: () => void;
 onPreview: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
  if (!window.confirm(`确认删除文件 ${file.filename} ？\n（仅从清单移除，物理文件保留在磁盘）`)) {
  return;
  }
  setBusy('delete');
  setErr(null);
  try {
  await deleteFile(file.id);
  onChanged?.();
  } catch (e) {
  setErr(e instanceof Error ? e.message : '删除失败');
  } finally {
  setBusy(null);
  }
  }

  async function handleSetPrimary() {
  if (
  !window.confirm(
  `将 ${file.filename} 设为主文件？\n⚠️ 当前实现会同时把此资料项标记为已确认。`,
  )
  ) {
  return;
  }
  setBusy('primary');
  setErr(null);
  try {
  await setPrimaryFile(itemId, file.id);
  onChanged?.();
  } catch (e) {
  setErr(e instanceof Error ? e.message : '设为主文件失败');
  } finally {
  setBusy(null);
  }
  }

  function handlePreview() {
  onPreview();
  }

 function handleDownload() {
 downloadFile(file.id, file.filename);
 }

 return (
 <li className="py-2 flex items-center gap-3 text-sm">
 {/* 主文件标记 */}
 {file.is_primary ? (
 <span
 className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-100 text-green-700"
 title="主文件（用于结算书合并）"
 >
 ★
 </span>
 ) : (
 <span className="w-5" aria-hidden />
 )}

 {/*文件名 + 元信息 */}
 <div className="flex-1 min-w-0">
 <div className="font-medium text-gray-800 truncate" title={file.filename}>
 {file.filename}
 {!file.is_pdf && (
 <span className="ml-2 text-xs text-orange-600">（非PDF，转码中）</span>
 )}
 </div>
 <div className="text-xs text-gray-500 mt-0.5">
 {formatFileSize(file.filesize)} · 上传于 {formatDateTime(file.uploaded_at)}
 </div>
 {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
 </div>

 {/* 操作按钮组 */}
 <div className="flex gap-1 flex-shrink-0">
 <button
 type="button"
 onClick={handlePreview}
 disabled={busy !== null}
 className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
 >
预览
 </button>
 <button
 type="button"
 onClick={handleDownload}
 disabled={busy !== null}
 className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
 >
 下载
 </button>
 {!file.is_primary && (
 <button
 type="button"
 onClick={handleSetPrimary}
 disabled={busy !== null}
 className="px-2 py-1 text-xs text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
 title="设为主文件（用于结算书合并）"
 >
 设为主文件
 </button>
 )}
 <button
 type="button"
 onClick={handleDelete}
 disabled={busy !== null}
 className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
 >
 删除
 </button>
 </div>
 </li>
 );
}
