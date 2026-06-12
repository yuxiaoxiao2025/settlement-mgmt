/**
 * 批量上传 modal — 公网部署用。
 *
 * 用户从本机一次性选多文件 → 落到项目 _unclaimed 区 → 后续从
 * UnclaimedFiles 区手动指派到具体 item（指派后端 stub，refresh_item 兜底）。
 *
 * 复用 FileDropZone 的拖拽 + 多选 + 进度 UI 逻辑，但走 project 级路由
 * (POST /api/projects/{id}/upload) 而非 item 级。
 */
import { useState, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { X, Upload, Loader2, CheckCircle2, XCircle, FileWarning } from 'lucide-react';
import { apiClient } from '@/api/client';

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

interface UploadItem {
  file: File;
  status: FileStatus;
  errorMsg?: string;
  uploadedId?: string;
}

interface Props {
  projectId: string;
  onClose: () => void;
  /** 上传完成（至少有一个 done）时调用，让父级 refetch */
  onUploaded?: () => void;
}

const ALLOWED_EXTS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
  '.txt', '.md', '.csv',
  '.zip', '.rar', '.7z',
]);

const MAX_SIZE = 200 * 1024 * 1024;  // 200MB / 文件（与后端 _ALLOWED_EXTS 一致）

export function BatchUploadModal({ projectId, onClose, onUploaded }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: File[]) {
    const filtered: UploadItem[] = [];
    for (const f of files) {
      const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        filtered.push({ file: f, status: 'error', errorMsg: '扩展名不允许' });
        continue;
      }
      if (f.size > MAX_SIZE) {
        filtered.push({ file: f, status: 'error', errorMsg: '超过 200MB' });
        continue;
      }
      filtered.push({ file: f, status: 'pending' });
    }
    setItems((prev) => [...prev, ...filtered]);
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  };

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) addFiles(files);
    e.target.value = '';  // 允许重复选同一文件
  };

  async function uploadAll() {
    const pending = items.filter((i) => i.status === 'pending');
    if (!pending.length) return;
    for (const it of pending) {
      setItems((prev) =>
        prev.map((x) => (x.file === it.file ? { ...x, status: 'uploading' } : x))
      );
      try {
        const fd = new FormData();
        fd.append('files', it.file);
        const r = await apiClient.post(`/projects/${projectId}/upload`, fd);
        const result = r.data as {
          uploaded?: Array<{ id: string; filename: string }>;
          errors?: Array<{ filename: string; status: number; detail: string }>;
        };
        const match = (result.uploaded || []).find(
          (u) => u.filename === it.file.name
        );
        if (match) {
          setItems((prev) =>
            prev.map((x) =>
              x.file === it.file ? { ...x, status: 'done', uploadedId: match.id } : x
            )
          );
        } else {
          const err = (result.errors || []).find(
            (e) => e.filename === it.file.name
          );
          setItems((prev) =>
            prev.map((x) =>
              x.file === it.file
                ? { ...x, status: 'error', errorMsg: err?.detail || '上传失败' }
                : x
            )
          );
        }
      } catch (e: unknown) {
        // 修 review Important 6: 网络/后端错误本地化
        // axios 错误 e.response.status 区分 400/413/409/500
        const errObj = e as { response?: { status?: number; data?: { detail?: string } }; message?: string };
        let msg = '网络错误，请重试';
        if (errObj.response?.status) {
          const s = errObj.response.status;
          if (s === 400) msg = '文件类型不允许';
          else if (s === 413) msg = '超过 200MB';
          else if (s === 409) msg = '项目已归档，不可上传';
          else if (s === 404) msg = '项目不存在';
          else if (s >= 500) msg = '服务器错误';
          else if (errObj.response.data?.detail) msg = errObj.response.data.detail;
        } else if (errObj.message) {
          msg = `网络错误：${errObj.message.slice(0, 50)}`;
        }
        setItems((prev) =>
          prev.map((x) =>
            x.file === it.file ? { ...x, status: 'error', errorMsg: msg } : x
          )
        );
      }
    }
    // 至少有一个 done 触发 onUploaded
    onUploaded?.();
  }

  const removeItem = (f: File) => {
    setItems((prev) => prev.filter((x) => x.file !== f));
  };

  const clearDone = () => {
    setItems((prev) => prev.filter((x) => x.status !== 'done'));
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Upload className="h-4 w-4" />
            批量上传到项目（_unclaimed）
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-700">点击或拖拽文件到这里</p>
            <p className="text-xs text-gray-500 mt-1">
              支持 PDF / Office / 图片 / 压缩包，单文件 ≤ 200MB
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={Array.from(ALLOWED_EXTS).join(',')}
              onChange={onSelect}
              className="hidden"
            />
          </div>

          {/* file list */}
          {items.length > 0 && (
            <ul className="border rounded divide-y text-sm">
              {items.map((it, idx) => (
                <li key={idx} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-0 truncate" title={it.file.name}>
                    {it.file.name}
                  </span>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {formatSize(it.file.size)}
                  </span>
                  <span className="flex-shrink-0 w-24 text-right">
                    {it.status === 'pending' && (
                      <span className="text-xs text-gray-400">待上传</span>
                    )}
                    {it.status === 'uploading' && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600 inline" />
                    )}
                    {it.status === 'done' && (
                      <span className="text-xs text-green-700 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        完成
                      </span>
                    )}
                    {it.status === 'error' && (
                      <span
                        className="text-xs text-red-600 inline-flex items-center gap-1"
                        title={it.errorMsg}
                      >
                        <XCircle className="h-4 w-4" />
                        {it.errorMsg || '失败'}
                      </span>
                    )}
                  </span>
                  {it.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => removeItem(it.file)}
                      className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0"
                      aria-label="移除"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {errorCount > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-start gap-2">
              <FileWarning className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                {errorCount} 个文件失败（已跳过）；{doneCount} 个已上传；{pendingCount} 个待上传。
                失败文件可点「清空」移除。
              </span>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t">
          <button
            type="button"
            onClick={() => setItems([])}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            清空
          </button>
          <div className="flex gap-2">
            {doneCount > 0 && (
              <button
                type="button"
                onClick={clearDone}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                清除已上传
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={uploadAll}
              disabled={pendingCount === 0}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              开始上传 ({pendingCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
