/**
 * 项目数据 hooks ——基于 TanStack Query。
 *
 * 设计：
 * - useProjects()：拉取项目列表，每 5s 轮询（首页感受进度变化）
 * - useProject(id)：单个项目详情（项目详情页用）
 * - useCreateProject / useUpdateProject / useArchiveProject / useDeleteProject：
 *   mutation hooks，乐观更新 + invalidate
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '@/api/projects'
import type {
  Project,
  ProjectCreatePayload,
  ProjectUpdatePayload,
} from '@/types'

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  byId: (id: string) => [...projectKeys.all, 'id', id] as const,
}

/** 拉取所有项目（每 5s 自动轮询） */
export function useProjects() {
  return useQuery<Project[]>({
    queryKey: projectKeys.list(),
    queryFn: () => listProjects(),
    refetchInterval: 5_000,
    staleTime: 1_000,
  })
}

/** 聚合统计：用于 ProjectList 顶部概览 */
export interface ProjectsAggregate {
  total: number
  active: number
  archived: number
  overdue: number
}

export function useProjectsAggregate(): ProjectsAggregate | null {
  const { data } = useProjects()
  if (!data) return null
  const total = data.length
  const active = data.filter((p) => p.status === 'active').length
  const archived = data.filter((p) => p.status === 'archived').length
  const overdue = data.filter(
    (p) => p.status === 'active' && p.days_to_deadline < 0,
  ).length
  return { total, active, archived, overdue }
}

/** 单个项目详情 */
export function useProject(id: string | null | undefined) {
  return useQuery<Project>({
    queryKey: projectKeys.byId(id ?? ''),
    queryFn: () => getProject(id as string),
    enabled: !!id,
    refetchInterval: 5_000,
    staleTime: 1_000,
  })
}

/** 新建项目 */
export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation<Project, Error, ProjectCreatePayload>({
    mutationFn: (payload) => createProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}

/** 编辑项目 */
export function useUpdateProject(id: string) {
  const qc = useQueryClient()
  return useMutation<Project, Error, ProjectUpdatePayload>({
    mutationFn: (payload) => updateProject(id, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: projectKeys.list() })
      qc.setQueryData(projectKeys.byId(id), data)
    },
  })
}

/** 归档项目 */
export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation<Project, Error, string>({
    mutationFn: (id) => archiveProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}

/** 删除项目 */
export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}