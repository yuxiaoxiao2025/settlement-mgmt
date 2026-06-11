/**
 * FilePreviewModal ——文件预览弹窗。
 *
 * 支持格式（全部纯前端渲染，零后端依赖）：
 * - .pdf  → 浏览器原生 <iframe>（后端返回 content-disposition: inline）
 * - .docx → mammoth.js → HTML
 * - .xlsx → SheetJS → HTML 表格
 * - .png/.jpg/.jpeg/.gif/.webp/.bmp → <img>
 * - .txt → fetch + <pre>
 * 其他格式：提示「请下载后用本地应用打开」。
 *
 * 替代了之前依赖 WPS 客户端的预览方案。
 */
import { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export interface FilePreviewModalProps {
  /** 关闭弹窗 */
  onClose: () => void;
  /** 后端 /api/files/{id}/preview 的相对 URL（vite 代理 /api → 8000） */
  previewUrl: string;
  /** 用于 fetch / Blob 的 URL（同上） */
  downloadUrl: string;
  /** 原始文件名（含扩展名） */
  filename: string;
  /** 后端标记：is_pdf */
  isPdf: boolean;
}

type State =
  | { kind: 'loading' }
  | { kind: 'pdf' }
  | { kind: 'image' }
  | { kind: 'html'; html: string; styleKind: 'docx' | 'xlsx' }
  | { kind: 'text'; text: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; message: string };

function getExt(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return (m?.[1] || '').toLowerCase();
}

export function FilePreviewModal({
  onClose,
  previewUrl,
  downloadUrl,
  filename,
  isPdf,
}: FilePreviewModalProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const ext = getExt(filename);
    if (isPdf || ext === 'pdf') {
      setState({ kind: 'pdf' });
      return;
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
      setState({ kind: 'image' });
      return;
    }
    if (ext === 'docx') {
      (async () => {
        try {
          const buf = await fetch(downloadUrl).then((r) => r.arrayBuffer());
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          setState({ kind: 'html', html: result.value, styleKind: 'docx' });
        } catch (e) {
          setState({ kind: 'error', message: (e as Error).message });
        }
      })();
      return;
    }
    if (ext === 'xlsx' || ext === 'xls') {
      (async () => {
        try {
          const buf = await fetch(downloadUrl).then((r) => r.arrayBuffer());
          const wb = XLSX.read(buf, { type: 'array' });
          const sheets = wb.SheetNames.map((name, i) => {
            const sheet = wb.Sheets[name];
            const html = XLSX.utils.sheet_to_html(sheet);
            return `<h3 class="sheet-title">工作表 ${i + 1}：${name}</h3>${html}`;
          });
          setState({ kind: 'html', html: sheets.join('<hr/>'), styleKind: 'xlsx' });
        } catch (e) {
          setState({ kind: 'error', message: (e as Error).message });
        }
      })();
      return;
    }
    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'log' || ext === 'json') {
      (async () => {
        try {
          const text = await fetch(downloadUrl).then((r) => r.text());
          setState({ kind: 'text', text });
        } catch (e) {
          setState({ kind: 'error', message: (e as Error).message });
        }
      })();
      return;
    }
    setState({
      kind: 'unsupported',
      reason: `暂不支持在线预览 .${ext} 文件。请下载后用对应应用打开。`,
    });
  }, [filename, isPdf, previewUrl, downloadUrl]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl flex flex-col w-full max-w-5xl"
        style={{ maxHeight: '92vh', height: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-gray-800 truncate">{filename}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{getExt(filename).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={downloadUrl}
              download={filename}
              className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
            >
              下载
            </a>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        </div>
        {/* 内容区 */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {state.kind === 'loading' && (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              加载中…
            </div>
          )}
          {state.kind === 'pdf' && (
            <iframe
              src={previewUrl}
              title={filename}
              className="w-full h-full bg-white"
            />
          )}
          {state.kind === 'image' && (
            <div className="flex items-center justify-center h-full p-4">
              <img
                src={previewUrl}
                alt={filename}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}
          {state.kind === 'html' && (
            <div
              className={`p-6 bg-white ${
                state.styleKind === 'docx' ? 'docx-preview' : 'xlsx-preview'
              }`}
              dangerouslySetInnerHTML={{ __html: state.html }}
            />
          )}
          {state.kind === 'text' && (
            <pre className="p-6 text-xs font-mono whitespace-pre-wrap break-all text-gray-800 bg-white">
              {state.text}
            </pre>
          )}
          {state.kind === 'unsupported' && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <div className="text-5xl">📄</div>
              <div className="text-sm text-gray-700">{state.reason}</div>
              <a
                href={downloadUrl}
                download={filename}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
              >
                下载文件
              </a>
            </div>
          )}
          {state.kind === 'error' && (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
              <div className="text-sm text-red-600">加载失败：{state.message}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}