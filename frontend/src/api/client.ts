/**
 * Axios 实例 — baseURL=/api（由 Vite 代理到 127.0.0.1:8000）
 *
 * 拦截器：
 *   - 请求：可注入 token（当前不实现，预留）
 *   - 响应：统一解包 FastAPI 的 { detail } 错误为 throw new Error(message)
 */

import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiError } from '@/types'

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 — 当前仅做日志；预留 token
apiClient.interceptors.request.use(
  (config) => {
    // if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器 — 把 FastAPI 错误统一为 Error
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response) {
      const { status, data } = error.response
      const detail = data?.detail ?? error.message ?? '请求失败'
      const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
      const err = new Error(`[${status}] ${message}`)
      // 保留 axios 字段供上层检查
      ;(err as Error & { status?: number; code?: string }).status = status
      ;(err as Error & { status?: number; code?: string }).code = data?.code
      return Promise.reject(err)
    }
    if (error.request) {
      return Promise.reject(new Error('网络错误：未收到响应'))
    }
    return Promise.reject(error)
  },
)

export default apiClient