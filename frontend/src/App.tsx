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
import ProjectList from '@/pages/ProjectList'
import ProjectNew from '@/pages/ProjectNew'
import Settlement from '@/pages/Settlement'
import TemplateManager from '@/pages/TemplateManager'

// ---- 占位页面（T-FE-B 的项目详情/编辑页待补；T-FE-C 页面已实装） ----

function PlaceholderPage({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="card max-w-md p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500">
          {hint ?? '此页面正在由其他 worker 实现。'}
        </p>
      </div>
    </div>
  )
}

const ProjectDetail = () => (
  <PlaceholderPage title="项目详情" hint="由 T-FE-B 实现。" />
)
const ProjectEdit = () => (
  <PlaceholderPage title="编辑项目" hint="由 T-FE-B 实现。" />
)

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
