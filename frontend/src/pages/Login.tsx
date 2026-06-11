/**
 * 登录页（v0.3.1+ — 公网部署需要鉴权）。
 *
 * 表单：用户名 + 密码 + 验证码（3 件套）
 * 验证码写在后端 .env，**不显示在前端页面**（用户从部署方单独获取）。
 *
 * 提交后：
 *   - 成功 → 跳 ?next= 参数指定的 URL（默认 /）
 *   - 失败 → 显示统一错误 [401] invalid credentials
 */
import { FormEvent, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, User, KeyRound, Loader2, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/store/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      await useAuth.getState().login({ username, password, verification_code: code })
      navigate(next, { replace: true })
    } catch (e) {
      setErr((e as Error).message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white shadow-xl rounded-2xl p-8 space-y-5"
      >
        {/* 顶部图标 + 标题 */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-indigo-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-800">项目结算资料管理</h1>
          <p className="text-sm text-slate-500">需要登录后才能访问</p>
        </div>

        {/* 用户名 */}
        <Field
          icon={<User className="w-4 h-4" />}
          label="用户名"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          placeholder="admin"
        />

        {/* 密码 */}
        <Field
          icon={<Lock className="w-4 h-4" />}
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        {/* 验证码 */}
        <Field
          icon={<KeyRound className="w-4 h-4" />}
          label="站点验证码"
          value={code}
          onChange={setCode}
          placeholder="部署方单独发放"
          hint="不区分大小写，可含或不含横线"
        />

        {/* 错误提示 */}
        {err && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading || !username || !password || !code}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300
                     text-white font-medium rounded-lg py-2.5 flex items-center
                     justify-center gap-2 transition"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              登录中…
            </>
          ) : (
            '登录'
          )}
        </button>

        <p className="text-xs text-slate-400 text-center pt-2">
          v0.3.1+ · 部署于受信环境，公网访问
        </p>
      </form>
    </div>
  )
}

interface FieldProps {
  icon: ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
  hint?: string
}

function Field({ icon, label, value, onChange, type = 'text', placeholder, autoComplete, hint }: FieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1.5">
        {icon}
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full border border-slate-300 rounded-lg px-3 py-2
                   focus:outline-none focus:ring-2 focus:ring-indigo-500
                   focus:border-transparent transition"
      />
      {hint && <span className="text-xs text-slate-400 mt-1 block">{hint}</span>}
    </label>
  )
}