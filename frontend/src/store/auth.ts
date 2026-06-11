/**
 * 鉴权 store（Zustand）。
 *
 * 状态：
 *   - username: 当前登录用户；null 表示未登录
 *   - status: 'unknown' | 'authenticated' | 'unauthenticated'
 *
 * 行为：
 *   - bootstrap(): 应用启动时调一次 /api/auth/me，确认登录态
 *   - login(req): 调 /api/auth/login；成功后写入 username
 *   - logout(): 调 /api/auth/logout，清状态
 *
 * 注意：token 不存前端（HttpOnly cookie 自动管），所以没有 token 字段。
 */
import { create } from 'zustand'
import api from '@/api/client'

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated'

interface AuthState {
  username: string | null
  status: AuthStatus
  bootstrap: () => Promise<void>
  login: (req: { username: string; password: string; verification_code: string }) => Promise<void>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  username: null,
  status: 'unknown',

  bootstrap: async () => {
    try {
      const { data } = await api.get<{ username: string }>('/auth/me')
      set({ username: data.username, status: 'authenticated' })
    } catch {
      set({ username: null, status: 'unauthenticated' })
    }
  },

  login: async (req) => {
    const { data } = await api.post<{ access_token: string; expires_in: number }>(
      '/auth/login',
      req,
    )
    // 登录成功后立即确认 session（cookie 已由 Set-Cookie 写入）
    set({ username: req.username, status: 'authenticated' })
    // 触发一次 me，确保 username 是服务端确认的（避免本地冒充）
    void data
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // 忽略错误 — logout 永远"成功"
    }
    set({ username: null, status: 'unauthenticated' })
  },
}))