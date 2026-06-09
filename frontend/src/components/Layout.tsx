/**
 * 全局布局：Sidebar + Topbar + <Outlet/>。
 *
 * 由 App.tsx 用 <Route element={<Layout />}> 包住所有页面。
 *
 * Sidebar：
 *  - 项目列表（/）
 *  - 模版管理（/template）
 *
 * Topbar：
 *  - 左侧：当前项目名（如有，从 store 读 currentProjectId → 拉取并显示）
 *  - 右侧：当前路径面包屑（基于 useLocation）
 *
 * Toaster：
 *  - 从 zustand 读 toasts 队列，渲染右下角浮层
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Folder, FileText, LayoutDashboard, Layers } from 'lucide-react';
import { useAppStore, selectToasts, type Toast } from '../store/app';
import { listProjects } from '../api/projects';
import type { Project } from '../types';

// ============ Layout ============

export default function Layout() {
  const location = useLocation();
  const params = useParams();

  // 当前项目 ID：从路由参数优先，回退到 store
  const projectIdFromRoute = params.id ?? null;
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);

  // 路由进入项目页时同步 store
  useEffect(() => {
    if (projectIdFromRoute && projectIdFromRoute !== currentProjectId) {
      setCurrentProjectId(projectIdFromRoute);
    } else if (!projectIdFromRoute && currentProjectId) {
      // 离开项目页时清空（让 ProjectList 重新选择）
      // 保留也行；按 SPEC-UI 上下文保留更连贯，这里不清空
    }
  }, [projectIdFromRoute, currentProjectId, setCurrentProjectId]);

  const activeProjectId = projectIdFromRoute ?? currentProjectId;

  return (
    <div className="flex h-screen w-screen bg-gray-50 text-gray-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar activeProjectId={activeProjectId} pathname={location.pathname} />
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

// ============ Sidebar ============

function Sidebar() {
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-blue-50 text-blue-700'
        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
    );

  return (
    <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
        <LayoutDashboard className="h-5 w-5 text-blue-600" />
        <span className="truncate font-semibold">结算资料管理</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        <NavLink to="/" end className={navItemClass}>
          <Folder className="h-4 w-4" />
          项目列表
        </NavLink>
        <NavLink to="/template" className={navItemClass}>
          <Layers className="h-4 w-4" />
          模版管理
        </NavLink>
      </nav>
      <div className="border-t border-gray-200 p-3 text-[10px] text-gray-400">
        v0.1.0 · 局域网工具
      </div>
    </aside>
  );
}

// ============ Topbar ============

interface TopbarProps {
  activeProjectId: string | null;
  pathname: string;
}

function Topbar({ activeProjectId, pathname }: TopbarProps) {
  // 拉项目名（仅在 activeProjectId 存在时）
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeProjectId) {
      setProjectName(null);
      return;
    }
    // 轻量：直接拉一次 list，避免每页各自拉详情
    listProjects()
      .then((projects: Project[]) => {
        if (cancelled) return;
        const p = projects.find((x) => x.id === activeProjectId);
        setProjectName(p?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setProjectName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const crumbs = buildBreadcrumbs(pathname, projectName);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {crumbs.map((c, idx) => (
          <span key={idx} className="flex items-center gap-2">
            {idx > 0 && <span className="text-gray-300">/</span>}
            {idx === crumbs.length - 1 ? (
              <span className="truncate font-semibold text-gray-900">
                {c.label}
              </span>
            ) : (
              <Link
                to={c.to ?? '#'}
                className="truncate text-gray-500 hover:text-gray-700"
              >
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <FileText className="h-4 w-4" />
        <span>结算资料交接清单</span>
      </div>
    </header>
  );
}

interface Crumb {
  label: string;
  to?: string;
}

function buildBreadcrumbs(pathname: string, projectName: string | null): Crumb[] {
  const crumbs: Crumb[] = [];

  if (pathname === '/' || pathname === '') {
    crumbs.push({ label: '项目列表' });
  } else if (pathname.startsWith('/projects/new')) {
    crumbs.push({ label: '项目列表', to: '/' });
    crumbs.push({ label: '新建项目' });
  } else if (pathname.match(/^\/projects\/[^/]+\/edit$/)) {
    crumbs.push({ label: '项目列表', to: '/' });
    crumbs.push({ label: projectName ?? '项目', to: '..' });
    crumbs.push({ label: '编辑' });
  } else if (pathname.match(/^\/projects\/[^/]+\/settlement$/)) {
    crumbs.push({ label: '项目列表', to: '/' });
    crumbs.push({ label: projectName ?? '项目', to: '..' });
    crumbs.push({ label: '生成结算书' });
  } else if (pathname.match(/^\/projects\/[^/]+$/)) {
    crumbs.push({ label: '项目列表', to: '/' });
    crumbs.push({ label: projectName ?? '项目详情' });
  } else if (pathname.startsWith('/template')) {
    crumbs.push({ label: '模版管理' });
  } else {
    crumbs.push({ label: pathname });
  }
  return crumbs;
}

// ============ Toaster ============

function Toaster() {
  const toasts = useAppStore(selectToasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="region"
      aria-label="通知"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const styleByKind = {
    success: 'bg-green-50 border-green-300 text-green-800',
    error: 'bg-red-50 border-red-300 text-red-800',
    info: 'bg-blue-50 border-blue-300 text-blue-800',
  }[toast.kind];

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={clsx(
        'pointer-events-auto min-w-[200px] max-w-sm rounded-md border px-3 py-2 text-left text-sm shadow-sm',
        'transition-opacity hover:opacity-90',
        styleByKind,
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 font-bold">
          {toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '✕' : 'ℹ'}
        </span>
        <span className="flex-1 whitespace-pre-line">{toast.message}</span>
      </div>
    </button>
  );
}