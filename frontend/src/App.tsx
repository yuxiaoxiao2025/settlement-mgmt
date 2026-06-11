/**
 * 应用路由（CONTEXT-04 §4 + DESIGN §8）
 *
 * 路由表：
 *   /                            → ProjectList      (T-FE-A)
 *   /projects/new                → ProjectNew       (T-FE-A)
 *   /projects/:id                → ProjectDetail    (T-FE-B)
 *   /projects/:id/edit           → ProjectEdit      (T-FE-B)
 *   /projects/:id/settlement     → Settlement       (T-FE-C)
 *   /template                    → TemplateManager  (T-FE-C)
 *
 * 所有页面用 T-FE-C 的 Layout 包住（Sidebar + Topbar + Toaster）。
 */

import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from '@/components/Layout'
import ProjectDetail from '@/pages/ProjectDetail'
import ProjectEdit from '@/pages/ProjectEdit'
import ProjectList from '@/pages/ProjectList'
import ProjectNew from '@/pages/ProjectNew'
import Settlement from '@/pages/Settlement'
import TemplateManager from '@/pages/TemplateManager'

export default function App() {
  return (
    <Routes>
      {/* 全局 Layout（Sidebar + Topbar） */}
      <Route element={<Layout />}>
        {/* 首页：项目列表 */}
        <Route path="/" element={<ProjectList />} />

        {/* 新建项目 */}
        <Route path="/projects/new" element={<ProjectNew />} />

        {/* 项目详情 + 子路由 */}
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/edit" element={<ProjectEdit />} />
        <Route path="/projects/:id/settlement" element={<Settlement />} />

        {/* 模版管理 */}
        <Route path="/template" element={<TemplateManager />} />

        {/* 兜底：跳回首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
