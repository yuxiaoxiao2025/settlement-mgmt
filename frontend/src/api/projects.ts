/**
 * 项目 API — 与后端 routers/projects.py 1:1 对应
 *
 * 端点（详见 CONTEXT-04 §2.1）：
 *   GET    /api/projects
 *   POST   /api/projects
 *   GET    /api/projects/{id}
 *   PATCH  /api/projects/{id}
 *   POST   /api/projects/{id}/archive
 *   DELETE /api/projects/{id}
 */

import apiClient from './client'
import type {
  Project,
  ProjectCreatePayload,
  ProjectUpdatePayload,
} from '@/types'

export async function listProjects(): Promise<Project[]> {
  const { data } = await apiClient.get<Project[]>('/projects')
  return data
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await apiClient.get<Project>(`/projects/${encodeURIComponent(id)}`)
  return data
}

export async function createProject(payload: ProjectCreatePayload): Promise<Project> {
  const { data } = await apiClient.post<Project>('/projects', payload)
  return data
}

export async function updateProject(
  id: string,
  payload: ProjectUpdatePayload,
): Promise<Project> {
  const { data } = await apiClient.patch<Project>(
    `/projects/${encodeURIComponent(id)}`,
    payload,
  )
  return data
}

export async function archiveProject(id: string): Promise<Project> {
  const { data } = await apiClient.post<Project>(
    `/projects/${encodeURIComponent(id)}/archive`,
  )
  return data
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${encodeURIComponent(id)}`)
}