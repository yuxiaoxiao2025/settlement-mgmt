/**
 * 应用路由（CONTEXT-04 §4 + DESIGN §8 + v0.3.1+ 公网鉴权）
 *
 * 路由表：
 *   /login                       → Login（未登录才能访问）
 *   /                            → ProjectList         （需登录）
 *   /projects/new                → ProjectNew
 *   /projects/new/template       → ProjectNewTemplate
 *   /projects/:id                → ProjectDetail
 *   /projects/:id/edit           → ProjectEdit
 *   /projects/:id/settlement     → Settlement
 *   /template                    → TemplateManager
 *
 * 鉴权：
 *   - 启动时 useAuth.bootstrap() 调 /api/auth/me 确认登录态
 *   - 未登录 → 自动跳 /login?next=...
 *   - 已登录访问 /login → 自动跳回 /
 */

import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import Layout from '@/components/Layout'
import LoginPage from '@/pages/Login'
import ProjectDetail from '@/pages/ProjectDetail'
import ProjectEdit from '@/pages/ProjectEdit'
import ProjectList from '@/pages/ProjectList'
import ProjectNew from '@/pages/ProjectNew'
import ProjectNewTemplate from '@/pages/ProjectNewTemplate'
import Settlement from '@/pages/Settlement'
import TemplateManager from '@/pages/TemplateManager'
import { useAuth } from '@/store/auth'

/** 包裹所有需要登录的路由 */
function RequireAuth() {
  const status = useAuth((s) => s.status)
  const location = useLocation()

  if (status === 'unknown') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        正在确认登录态…
      </div>
    )
  }
  if (status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <Outlet />
}

/** 已登录用户访问 /login 时自动跳走 */
function RedirectIfAuthed() {
  const status = useAuth((s) => s.status)
  if (status === 'authenticated') return <Navigate to="/" replace />
  if (status === 'unknown') return null
  return <Outlet />
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <Routes>
      {/* /login — 已登录自动跳走 */}
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* 主应用 — 全部需登录 */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<ProjectList />} />
          <Route path="/projects/new" element={<ProjectNew />} />
          <Route path="/projects/new/template" element={<ProjectNewTemplate />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/edit" element={<ProjectEdit />} />
          <Route path="/projects/:id/settlement" element={<Settlement />} />
          <Route path="/template" element={<TemplateManager />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}