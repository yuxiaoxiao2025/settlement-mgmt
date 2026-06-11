/**
 * 拖拽上传组件（v0.3.1+ — 替代原桌面应用"丢文件到文件夹"的体验）。
 *
 * 用法：
 *   <FileDropZone itemId={item.id} onUploaded={() => refetch()} />
 *
 * 行为：
 *   - 点击或拖入 → 调 POST /api/items/{id}/upload
 *   - 多文件串行上传（避免后端压力 + 数据库锁）
 *   - 显示每文件进度 + 最终结果
 *   - 拖入时高亮边框，松开恢复
 *
 * 设计选择：
 *   - 用原生 input + label 也支持点击触发，但拖拽体验更现代
 *   - 不引入 react-dropzone（避免依赖膨胀）
 */
import { DragEvent, useRef, useState, type ChangeEvent } from 'react'
import { Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react'

import apiClient from '@/api/client'

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

interface UploadItem {
  file: File
  status: FileStatus
  message?: string
}

interface Props {
  itemId: string
  onUploaded?: () => void
  /** 允许的扩展名白名单 — 与后端保持一致（前端提前拦截友好提示） */
  accept?: string
}

const DEFAULT_ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.webp,.bmp,.txt,.md,.csv,.zip,.rar,.7z'

export default function FileDropZone({ itemId, onUploaded, accept = DEFAULT_ACCEPT }: Props) {
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) void upload(files)
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length) void upload(files)
    e.target.value = ''  // 允许重复选同一文件
  }

  const upload = async (files: File[]) => {
    // 初始化状态
    const queue: UploadItem[] = files.map((f) => ({ file: f, status: 'pending' }))
    setItems((prev) => [...queue, ...prev])

    // 串行上传
    for (const q of queue) {
      q.status = 'uploading'
      setItems((prev) => prev.map((x) => (x.file === q.file ? { ...x, status: 'uploading' } : x)))
      try {
        const fd = new FormData()
        fd.append('file', q.file)
        await apiClient.post(`/items/${itemId}/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        q.status = 'done'
        setItems((prev) => prev.map((x) => (x.file === q.file ? { ...x, status: 'done' } : x)))
      } catch (e) {
        q.status = 'error'
        q.message = (e as Error).message
        setItems((prev) => prev.map((x) => (x.file === q.file ? { ...x, status: 'error', message: q.message } : x)))
      }
    }

    onUploaded?.()
  }

  return (
    <div className="space-y-3">
      {/* 拖拽区 */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-colors
          ${dragging
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/50'}
        `}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
        <p className="text-sm text-slate-600">
          <span className="font-medium text-indigo-600">点击选择</span>
          <span className="mx-2 text-slate-300">|</span>
          <span className="font-medium text-indigo-600">拖拽文件</span>
          到这里
        </p>
        <p className="text-xs text-slate-400 mt-1">PDF / Word / Excel / 图片，最大 200MB / 文件</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          onChange={onPick}
          className="hidden"
        />
      </div>

      {/* 队列状态 */}
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-md px-3 py-1.5"
            >
              {it.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
              {it.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {it.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
              {it.status === 'pending' && <span className="w-4 h-4 rounded-full border-2 border-slate-300" />}
              <span className="truncate flex-1">{it.file.name}</span>
              <span className="text-xs text-slate-400">{(it.file.size / 1024).toFixed(1)} KB</span>
              {it.status === 'error' && it.message && (
                <span className="text-xs text-red-600 max-w-[40%] truncate" title={it.message}>
                  {it.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}