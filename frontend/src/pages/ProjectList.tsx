/**
 * 项目列表页 — 首页（CONTEXT-04 §4 + SPEC §7 + §11 剧本 1）
 *
 * 功能：
 *   - 网格展示所有项目卡片（用 T-FE-C 的 <ProjectCard/>）
 *   - 顶部「新建项目」按钮
 *   - 概览统计（总数 / 进行中 / 逾期）
 *   - 筛选条：「全部 / 进行中 / 已归档」
 *   - 排序：截止日期升序（后端已排）
 *   - TanStack Query 5s 轮询
 *   - Loading / Error / Empty 三态
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, RefreshCw, AlertCircle, FolderOpen } from 'lucide-react'

import { useProjects, useProjectsAggregate, useDeleteProject } from '@/hooks/useProjects'
import { ProjectCard } from '@/components/ProjectCard'
import { useAppStore } from '@/store/app'
import { formatDate } from '@/lib/format'
import type { Project, ProjectStatus } from '@/types'

type Filter = 'all' | ProjectStatus

export default function ProjectList() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch, isFetching } = useProjects()
  const aggregate = useProjectsAggregate()
  const pushToast = useAppStore((s) => s.pushToast)

  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo<Project[]>(() => {
    if (!data) return []
    if (filter === 'all') return data
    return data.filter((p) => p.status === filter)
  }, [data, filter])

  // 删除项目 mutation
  const deleteProject = useDeleteProject()

  const handleRefresh = async () => {
    try {
      await refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '刷新失败'
      pushToast('error', `刷新失败：${msg}`)
    }
  }

  const handleDelete = async (project: Project) => {
    try {
      await deleteProject.mutateAsync(project.id)
      pushToast('success', `项目「${project.name}」已删除`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '删除失败'
      pushToast('error', `删除失败：${msg}`)
      throw e
    }
  }

  return (
    <div className="space-y-4">
      {/* ============ Header ============ */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">项目列表</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理项目结算资料的提交、复核与结算书生成。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={isFetching}
            aria-label="刷新"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            刷新
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate('/projects/new')}
          >
            <Plus className="h-4 w-4" />
            新建项目
          </button>
        </div>
      </header>

      {/* ============ Stats ============ */}
      {aggregate && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="项目总数" value={aggregate.total} tone="blue" />
          <StatCard label="进行中" value={aggregate.active} tone="green" />
          <StatCard label="已归档" value={aggregate.archived} tone="gray" />
          <StatCard label="已逾期" value={aggregate.overdue} tone="red" />
        </section>
      )}

      {/* ============ Filter ============ */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <FilterTab
          label="全部"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterTab
          label="进行中"
          active={filter === 'active'}
          onClick={() => setFilter('active')}
        />
        <FilterTab
          label="已归档"
          active={filter === 'archived'}
          onClick={() => setFilter('archived')}
        />
      </div>

      {/* ============ Body ============ */}
      {isLoading && <ProjectListSkeleton />}

      {isError && (
        <div className="card flex items-start gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">无法加载项目列表</p>
            <p className="mt-1 text-red-600">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
            <p className="mt-2 text-xs text-red-500">
              请确认后端已启动（http://127.0.0.1:8000），并检查 Vite 代理配置。
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={handleRefresh}>
            重试
          </button>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState filter={filter} />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <ul
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-label="项目列表"
        >
          {filtered.map((p) => (
            <li key={p.id}>
              <ProjectCard
                project={p}
                onDelete={handleDelete}
              />
            </li>
          ))}
        </ul>
      )}

      {/* ============ Footer ============ */}
      {!isLoading && data && data.length > 0 && (
        <p className="text-center text-xs text-gray-400">
          显示 {filtered.length} / {data.length} 项 · 每 5 秒自动刷新
        </p>
      )}
    </div>
  )
}

// ============= 子组件 =============

interface StatCardProps {
  label: string
  value: number
  tone: 'blue' | 'green' | 'gray' | 'red'
}

const STAT_TONE: Record<
  StatCardProps['tone'],
  { bg: string; text: string }
> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
  green: { bg: 'bg-green-50', text: 'text-green-700' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-700' },
  red: { bg: 'bg-red-50', text: 'text-red-700' },
}

function StatCard({ label, value, tone }: StatCardProps) {
  const t = STAT_TONE[tone]
  return (
    <div className={`card ${t.bg} p-3`}>
      <div className={`text-xs ${t.text} opacity-80`}>{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${t.text}`}>
        {value}
      </div>
    </div>
  )
}

interface FilterTabProps {
  label: string
  active: boolean
  onClick: () => void
}

function FilterTab({ label, active, onClick }: FilterTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function ProjectListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="card animate-pulse p-4">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-200" />
              <div className="h-3 w-2/3 rounded bg-gray-200" />
            </div>
            <div className="h-6 w-16 rounded bg-gray-200" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="card flex flex-col items-center justify-center px-4 py-12 text-center">
      <FolderOpen className="h-12 w-12 text-gray-300" />
      <h3 className="mt-4 text-base font-semibold text-gray-900">
        {filter === 'archived' ? '还没有归档项目' : '还没有项目'}
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        {filter === 'archived'
          ? '归档后的项目会出现在这里。'
          : '点击右上角「新建项目」开始第一个项目。'}
      </p>
      {filter !== 'archived' && (
        <Link to="/projects/new" className="btn-primary mt-4">
          <Plus className="h-4 w-4" />
          新建项目
        </Link>
      )}
    </div>
  )
}

// 日期工具：保留 export 供 T-FE-C 复用（避免循环依赖）
export { formatDate }