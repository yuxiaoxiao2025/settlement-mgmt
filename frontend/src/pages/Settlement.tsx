/**
 * 项目结算书页（/projects/:id/settlement）。
 *
 * 流程（DESIGN §4.5 + SPEC §6）：
 *   1. 加载时 GET /preview 检查 readiness
 *      - ready=true  → 「生成结算书」按钮 enabled
 *      - ready=false → 按钮 disabled + 「缺失 N 项」提示 + 缺失列表
 *   2. 点生成 → POST /build（后端首次实现是同步，但前端按异步模型轮询 /status）
 *      - 409 → toast「未全部确认」，回到 ready=false
 *      - 其他错误 → toast 错误
 *   3. 轮询 GET /status（每 1.5s）直到 status ∈ {success, failed}
 *   4. success → 显示「下载结算书」按钮（FileResponse 后端自动给 filename）
 *      failed → 显示错误信息 + 「重试」按钮
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, Loader2, RefreshCw } from 'lucide-react';
import {
  previewSettlement,
  buildSettlement,
  getSettlementStatus,
  downloadSettlement,
  downloadSettlementUrl,
  previewSettlementUrl,
} from '../api/settlement';
import { getProject } from '../api/projects';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { useAppStore } from '../store/app';
import type { Project, SettlementPreview, SettlementJob } from '../types';

// 轮询间隔（ms）。后端首次实现是同步生成，但保持轮询习惯便于将来切异步。
const POLL_INTERVAL_MS = 1500;

type BuildPhase =
  | 'idle'        // 初始
  | 'previewing'  // 正在检查
  | 'ready'       // 检查完成，可生成
  | 'building'    // 生成中（POST /build 完成前 + 轮询 status）
  | 'success'     // 生成成功
  | 'failed';     // 生成失败

export default function Settlement() {
  const { id: projectId } = useParams<{ id: string }>();
  const pushToast = useAppStore((s) => s.pushToast);

  // 数据
  const [project, setProject] = useState<Project | null>(null);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [job, setJob] = useState<SettlementJob | null>(null);
  const [phase, setPhase] = useState<BuildPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // 轮询控制
  const pollTimerRef = useRef<number | null>(null);
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // 清理轮询
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // 初始加载：项目信息 + 当前 status + preview
  const loadInitial = useCallback(async () => {
    if (!projectId) return;
    setPhase('previewing');
    setError(null);
    try {
      const [proj, prev, status] = await Promise.all([
        getProject(projectId),
        previewSettlement(projectId),
        getSettlementStatus(projectId),
      ]);
      setProject(proj);
      setPreview(prev);
      setJob(status);

      // 推断初始 phase
      if (status.status === 'success') {
        setPhase('success');
      } else if (status.status === 'failed') {
        setPhase('failed');
      } else {
        // idle / running 都按 preview 结果决定
        setPhase(prev.ready ? 'ready' : 'idle');
      }
    } catch (e) {
      const msg = extractError(e);
      setError(msg);
      setPhase('failed');
      pushToast('error', `加载失败：${msg}`);
    }
  }, [projectId, pushToast]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 轮询 status
  const startPolling = useCallback(() => {
    stopPolling();
    if (!projectId) return;
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const s = await getSettlementStatus(projectId);
        setJob(s);
        if (s.status === 'success') {
          setPhase('success');
          stopPolling();
          pushToast('success', '结算书生成成功');
        } else if (s.status === 'failed') {
          setPhase('failed');
          setError(s.error ?? '生成失败');
          stopPolling();
          pushToast('error', `生成失败：${s.error ?? '未知错误'}`);
        }
        // running → 继续轮询
      } catch (e) {
        const msg = extractError(e);
        stopPolling();
        setPhase('failed');
        setError(msg);
        pushToast('error', `轮询失败：${msg}`);
      }
    }, POLL_INTERVAL_MS);
  }, [projectId, pushToast, stopPolling]);

  // 点生成
  const handleBuild = useCallback(async () => {
    if (!projectId) return;
    setPhase('building');
    setError(null);
    try {
      const j = await buildSettlement(projectId);
      setJob(j);
      // 后端首次实现是同步：j.status 已是 success/failed
      if (j.status === 'success') {
        setPhase('success');
        pushToast('success', '结算书生成成功');
      } else if (j.status === 'failed') {
        setPhase('failed');
        setError(j.error ?? '生成失败');
        pushToast('error', `生成失败：${j.error ?? '未知错误'}`);
      } else {
        // running → 启动轮询
        startPolling();
      }
    } catch (e) {
      const msg = extractError(e);
      setPhase('failed');
      setError(msg);
      pushToast('error', `生成失败：${msg}`);
    }
  }, [projectId, pushToast, startPolling]);

  // 重试（先回到 preview，再由用户点生成）
  const handleRetry = useCallback(async () => {
    stopPolling();
    await loadInitial();
  }, [loadInitial, stopPolling]);

  // 点下载
  const handleDownload = useCallback(() => {
    if (!projectId) return;
    const filename = job?.output_path
      ? job.output_path.split(/[/\\]/).pop()
      : `结算书_${project?.name ?? projectId}.pdf`;
    downloadSettlement(projectId, filename);
  }, [projectId, project, job]);

  // 点预览（在弹窗里打开）
  const handlePreview = useCallback(() => {
    setShowPreviewModal(true);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to={`/projects/${projectId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← 返回项目详情
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">生成结算书</h1>
        {project && (
          <p className="mt-1 text-sm text-gray-500">
            项目：<span className="font-medium text-gray-700">{project.name}</span>
            {project.status === 'archived' && (
              <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                已归档
              </span>
            )}
          </p>
        )}
      </header>

      <ReadinessCard
        phase={phase}
        preview={preview}
        project={project}
        error={error}
        onBuild={handleBuild}
        onRetry={handleRetry}
        onDownload={handleDownload}
        onPreview={handlePreview}
      />

      {/* 结算书 PDF 预览弹窗 */}
      {showPreviewModal && projectId && (
        <FilePreviewModal
          onClose={() => setShowPreviewModal(false)}
          previewUrl={previewSettlementUrl(projectId)}
          downloadUrl={downloadSettlementUrl(projectId)}
          filename={job?.output_path?.split(/[/\\]/).pop() ?? `结算书_${project?.name ?? projectId}.pdf`}
          isPdf={true}
        />
      )}
    </div>
  );
}

// ============ 子组件 ============

interface ReadinessCardProps {
  phase: BuildPhase;
  preview: SettlementPreview | null;
  project: Project | null;
  error: string | null;
  onBuild: () => void;
  onRetry: () => void;
  onDownload: () => void;
  onPreview: () => void;
}

function ReadinessCard({
  phase,
  preview,
  project,
  error,
  onBuild,
  onRetry,
  onDownload,
  onPreview,
}: ReadinessCardProps) {
  const isLoading = phase === 'previewing' || phase === 'building';
  const showMissing = phase !== 'building' && preview && !preview.ready;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {/* 状态图标 + 标题 */}
      <div className="flex items-start gap-3">
        {phase === 'success' ? (
          <CheckCircle2 className="h-6 w-6 shrink-0 text-green-500" />
        ) : phase === 'failed' ? (
          <AlertTriangle className="h-6 w-6 shrink-0 text-red-500" />
        ) : phase === 'building' || phase === 'previewing' ? (
          <Loader2 className="h-6 w-6 shrink-0 animate-spin text-blue-500" />
        ) : (
          <FileText className="h-6 w-6 shrink-0 text-gray-400" />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">
            {titleForPhase(phase, preview)}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {descriptionForPhase(phase, preview, error, project)}
          </p>
        </div>
      </div>

      {/* 缺失项清单 */}
      {showMissing && preview.missing.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <div className="mb-1 font-medium text-red-700">
            还有 {preview.missing.length} 项未确认：
          </div>
          <ul className="ml-4 list-disc space-y-0.5 text-red-700">
            {preview.missing.slice(0, 8).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
            {preview.missing.length > 8 && (
              <li className="text-red-500">… 等共 {preview.missing.length} 项</li>
            )}
          </ul>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {/* 生成按钮 */}
        {(phase === 'idle' || phase === 'ready' || phase === 'previewing') && (
          <button
            type="button"
            onClick={onBuild}
            disabled={isLoading || !preview?.ready}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {buildingLabel(phase)}
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                生成结算书
              </>
            )}
          </button>
        )}

        {/* 预览 / 下载按钮 */}
        {phase === 'success' && (
          <>
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex items-center gap-2 rounded-md border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-600 shadow-sm hover:bg-blue-50"
            >
              <Eye className="h-4 w-4" />
              预览结算书
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700"
            >
              <Download className="h-4 w-4" />
              下载结算书
            </button>
          </>
        )}

        {/* 重试按钮 */}
        {phase === 'failed' && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        )}

        {/* 构建中副提示 */}
        {phase === 'building' && (
          <span className="text-xs text-gray-500">
            合并 25 份资料并生成封面与目录，预计 10-30 秒…
          </span>
        )}
      </div>
    </div>
  );
}

// ============ 文案 helpers ============

function buildingLabel(phase: BuildPhase): string {
  return phase === 'building' ? '正在生成…' : '检查中…';
}

function titleForPhase(phase: BuildPhase, preview: SettlementPreview | null): string {
  switch (phase) {
    case 'previewing':
      return '正在检查可生成性…';
    case 'building':
      return '正在生成结算书…';
    case 'success':
      return '结算书已生成';
    case 'failed':
      return '生成失败';
    case 'ready':
      return preview?.ready ? '全部资料已确认，可以生成' : '尚有资料未确认';
    case 'idle':
    default:
      return preview?.ready ? '准备就绪' : '请先完成所有资料项';
  }
}

function descriptionForPhase(
  phase: BuildPhase,
  preview: SettlementPreview | null,
  error: string | null,
  project: Project | null,
): string {
  if (phase === 'failed' && error) return error;

  if (phase === 'success') {
    const size = preview ? `${preview.missing.length} 项缺失` : '';
    return `已生成包含封面、目录、${project?.progress.total ?? 25} 份资料的 PDF。${size}`;
  }

  if (preview) {
    if (preview.ready) {
      return `项目下 ${project?.progress.total ?? 25} 项资料全部 confirmed。点击下方按钮开始合并。`;
    }
    return `项目下还有 ${preview.missing.length} 项未确认。完成后才能生成结算书。`;
  }
  return '正在加载项目信息…';
}

// ============ utils ============

/**
 * 提取错误信息。
 *
 * 注意：apiClient 的响应拦截器会把 FastAPI 的 { detail } 错误统一转换为
 * `new Error('[${status}] ${detail}')`，所以这里只需要 e.message 即可。
 * 兜底处理 string / unknown。
 */
function extractError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}