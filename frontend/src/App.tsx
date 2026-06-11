/**
 * 应用路由（CONTEXT-04 §4 + DESIGN §8）
 *
 * 路由表：
 *   /                            → ProjectList
 *   /projects/new                → ProjectNew              （第 1 步：项目基本信息）
 *   /projects/new/template       → ProjectNewTemplate      （第 2 步：选择/添加资料项）
 *   /projects/:id                → ProjectDetail
 *   /projects/:id/edit           → ProjectEdit
 *   /projects/:id/settlement     → Settlement
 *   /template                    → TemplateManager
 *
 * 所有页面用 Layout 包住（Sidebar + Topbar + Toaster）。
 */

import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from '@/components/Layout'
import ProjectDetail from '@/pages/ProjectDetail'
import ProjectEdit from '@/pages/ProjectEdit'
import ProjectList from '@/pages/ProjectList'
import ProjectNew from '@/pages/ProjectNew'
import ProjectNewTemplate from '@/pages/ProjectNewTemplate'
import Settlement from '@/pages/Settlement'
import TemplateManager from '@/pages/TemplateManager'

export default function App() {
  return (
    <Routes>
      {/* 全局 Layout（Sidebar + Topbar） */}
      <Route element={<Layout />}>
        {/* 首页：项目列表 */}
        <Route path="/" element={<ProjectList />} />

        {/* 新建项目（两步流程） */}
        <Route path="/projects/new" element={<ProjectNew />} />
        <Route path="/projects/new/template" element={<ProjectNewTemplate />} />

        {/* 项目详情 + 子路由 */}
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/edit" element={<ProjectEdit />} />
        <Route path="/projects/:id/settlement" element={<Settlement />} />

        {/* 模版管理（管理员长期维护全局模版） */}
        <Route path="/template" element={<TemplateManager />} />

        {/* 兜底：跳回首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
