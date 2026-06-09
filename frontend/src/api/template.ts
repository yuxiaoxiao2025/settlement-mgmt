/**
 * 模版 API — 与后端 routers/template.py 对应
 *
 * 端点：
 *   GET  /api/template
 *   POST /api/template/items
 *
 * 主要由 T-FE-C 的 TemplateManager 页面调用，但 T-FE-A 也写模块
 * 是为了在 CONTEXT-04 §2.2 共享 types 一并到位。
 */

import apiClient from './client'
import type { Template, PromoteRequest, PromoteResponse } from '@/types'

export async function getTemplate(): Promise<Template> {
  const { data } = await apiClient.get<Template>('/template')
  return data
}

export async function promoteItem(payload: PromoteRequest): Promise<PromoteResponse> {
  const { data } = await apiClient.post<PromoteResponse>('/template/items', payload)
  return data
}