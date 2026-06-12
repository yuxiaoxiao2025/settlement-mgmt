/**
 * Axios 实例 — baseURL=/api（由 Vite 代理到后端，见 vite.config.ts）
 *
 * 拦截器：
 *   - 请求：无（HttpOnly cookie 自动带上，CSRF 由 SameSite=Lax 防护）
 *   - 响应：401 → 跳 /login；其它 → 解包 { detail } 为 Error
 *
 * 注：v0.3.1+ 公网部署后端使用 HttpOnly Secure cookie 鉴权，前端无法直接
 * 读 token —— 这是有意的，XSS 偷不走。如需在浏览器存储里放 token，
 * 反而是反模式。
 */

import axios, { AxiosError, type AxiosInstance } from 'axios'
import type { ApiError } from '@/types'

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 60_000,  // 上传/合并 PDF 可能较慢
  withCredentials: true,  // HttpOnly cookie 自动带上
})

// 响应拦截器：401 → 跳登录；其它 → 解包
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response) {
      const { status, data } = error.response

      // 未登录或 session 过期 → 跳登录页（避免无限循环：登录页本身不走这个拦截器）
      if (status === 401 && !window.location.pathname.startsWith('/login')) {
        // 修 B-04：location.replace 同步跳登录，return 挂起 promise 不 reject
        // 避免调用方 .catch() 把 'not authenticated' 弹成 toast（与跳转同时出现）
        const next = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.replace(`/login?next=${next}`)
        return new Promise(() => {})  // 永远不 resolve，调用方 .then() 链挂起
      }

      const detail = data?.detail ?? error.message ?? '请求失败'
      const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
      const err = new Error(`[${status}] ${message}`)
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