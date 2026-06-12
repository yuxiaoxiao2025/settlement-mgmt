/**
 *资料项单行 ——序号 +名称 +状态徽章 + 文件数 + 操作按钮组 +展开的文件列表。
 *
 *关键 SPEC：
 * - SPEC-UI-4：每行 MUST 显示序号 +名称 +状态徽章 + 文件数 + 操作按钮
 * -状态机（SPEC §2.1 + 本任务约束）：
 * pending → 「上传」（公网部署必填）
 * uploaded → 「复核」「驳回」
 * rejected → 「上传」「重置」
 * confirmed → 「重置」（管理员强制重置；SPEC-ST-5业务上不可回退，但 admin 可重置）
 *
 * 注意：
 * -驳回按钮 →弹出 prompt 输入 note
 * -复核按钮 → 直接调 API（后端自动选第一个 PDF 作为主文件）
 * -展开/收起状态在父级 ProjectDetail 不需要持久化（行级 useState即可）
 * -上传按钮 → 点击展开 inline dropzone（复用 FileDropZone）
 */
import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { Item } from '../types';
import { StatusBadge } from './StatusBadge';
import { FileList } from './FileList';
import FileDropZone from './FileDropZone';

interface ItemRowProps {
 item: Item;
 onConfirm: (itemId: string) => void;
 onReject: (itemId: string, note: string) => void;
 onReset: (itemId: string) => void;
 onRefresh: () => void;
 /**任意 mutation 进行中（用于禁用所有按钮） */
 disabled?: boolean;
}

export function ItemRow({
 item,
 onConfirm,
 onReject,
 onReset,
 onRefresh,
 disabled = false,
}: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  // 修公网部署：行级上传按钮 → 展开 inline dropzone
  const [showUpload, setShowUpload] = useState(false);

  function handleReject() {
  const note = window.prompt('请输入驳回备注（必填）：', '');
  if (note === null) return;
  const trimmed = note.trim();
  if (!trimmed) {
  window.alert('驳回备注不能为空');
  return;
  }
  onReject(item.id, trimmed);
  }

 function handleReset() {
 if (!window.confirm(`确认重置第 ${item.seq} 项「${item.name}」为待上传？`)) return;
 onReset(item.id);
 }

 const fileCount = item.files.length;

 return (
 <div className="border-b border-gray-100 last:border-b-0">
 <div className="flex items-center gap-3 py-3 px-2 hover:bg-gray-50 transition-colors">
 {/*展开/收起按钮 */}
 <button
 type="button"
 onClick={() => setExpanded((v) => !v)}
 className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
 aria-label={expanded ? '收起文件列表' : '展开文件列表'}
 >
 {expanded ? '▼' : '▶'}
 </button>

 {/*序号 */}
 <span className="w-8 text-right text-sm font-mono text-gray-500">
 {String(item.seq).padStart(2, '0')}
 </span>

 {/*名称 +描述 */}
 <div className="flex-1 min-w-0">
 <div className="font-medium text-gray-900 truncate" title={item.name}>
 {item.name}
 {item.is_extension && (
 <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-purple-100 text-purple-700">
扩展
 </span>
 )}
 </div>
 {item.description && (
 <div className="text-xs text-gray-500 mt-0.5 truncate" title={item.description}>
 {item.description}
 </div>
 )}
 {item.rejected_note && (
 <div className="text-xs text-red-600 mt-0.5">
驳回备注：{item.rejected_note}
 </div>
 )}
 </div>

 {/*状态徽章 */}
 <StatusBadge status={item.status} />

 {/* 文件数 */}
 <span
 className="text-xs text-gray-500 w-16 text-right"
 title={`${fileCount} 个文件`}
 >
 {fileCount >0 ? `${fileCount} 文件` : '无文件'}
 </span>

  {/* 操作按钮组 ——按状态切换（SPEC §2.1 + CONTEXT-04约束） */}
  <div className="flex gap-1 flex-shrink-0 w-44 justify-end">
  {item.status === 'pending' && (
  <>
  <button
  type="button"
  onClick={() => setShowUpload((v) => !v)}
  disabled={disabled}
  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 inline-flex items-center gap-1"
  title="上传文件到该项"
  >
  <Upload className="h-3 w-3" />
  {showUpload ? '收起' : '上传'}
  </button>
  {showUpload && (
  <button
  type="button"
  onClick={() => setShowUpload(false)}
  className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded inline-flex items-center"
  title="关闭上传区"
  aria-label="关闭上传区"
  >
  <X className="h-3 w-3" />
  </button>
  )}
  </>
  )}

  {item.status === 'uploaded' && (
  <>
  <button
  type="button"
  onClick={() => onConfirm(item.id)}
  disabled={disabled || fileCount ===0}
  className="px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
  title={fileCount ===0 ? '无文件可确认' : '标记为已确认'}
  >
  复核
  </button>
  <button
  type="button"
  onClick={handleReject}
  disabled={disabled}
  className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
  >
  驳回
  </button>
  </>
  )}

  {item.status === 'rejected' && (
  <>
  <button
  type="button"
  onClick={() => setShowUpload((v) => !v)}
  disabled={disabled}
  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 inline-flex items-center gap-1"
  title="驳回后可重新上传文件"
  >
  <Upload className="h-3 w-3" />
  {showUpload ? '收起' : '上传'}
  </button>
  <button
  type="button"
  onClick={handleReset}
  disabled={disabled}
  className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
  title="重置为待上传"
  >
  重置
  </button>
  </>
  )}

  {item.status === 'confirmed' && (
  <button
  type="button"
  onClick={handleReset}
  disabled={disabled}
  className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
  title="重置为待上传"
  >
  重置
  </button>
  )}
  </div>
  </div>

  {/* 修公网部署：行级上传区（pending/rejected 展开） */}
  {showUpload && (item.status === 'pending' || item.status === 'rejected') && (
  <div className="pb-3 pl-10">
  <FileDropZone
  itemId={item.id}
  onUploaded={() => {
  setShowUpload(false);
  onRefresh();
  }}
  />
  </div>
  )}

 {/*展开后的文件列表 */}
 {expanded && (
 <div className="pb-3 pl-10">
 <FileList itemId={item.id} files={item.files} onChanged={onRefresh} />
 </div>
 )}
 </div>
 );
}
