/**
 * 新建项目 — 第 1 步：项目基本信息（CONTEXT-04 §2.2 + SPEC §3.1）
 *
 * 表单字段（与后端 ProjectCreate schema 一致）：
 *   - name              必填
 *   - handover_date     选填（date）
 *   - deadline          必填（date，不能早于 handover_date / 不能早于今天）
 *   - construction_unit 选填
 *   - handover_person   选填
 *   - receiving_unit    选填
 *   - receiving_person  选填
 *
 * 流程（v0.3.0 起分两步）：
 *   1. 本页填项目基本信息 → 「下一步」
 *   2. 跳到 /projects/new/template 选择资料项（独立页）
 *
 * 提交流：location.state 传第 2 步（刷新即丢，符合"草稿"语义）。
 *
 * 客户端预校验（SPEC-PR-2）：
 *   - 截止日期 ≥ 移交日期
 *   - 截止日期 ≥ 今天
 */

import { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react'

import { emptyToNull } from '@/lib/format'
import type { ProjectBasicInfo } from '@/types'

interface FormState {
  name: string
  handover_date: string
  deadline: string
  construction_unit: string
  handover_person: string
  receiving_unit: string
  receiving_person: string
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultForm(): FormState {
  return {
    name: '',
    handover_date: '',
    deadline: '',
    construction_unit: '',
    handover_person: '',
    receiving_unit: '',
    receiving_person: '',
  }
}

export default function ProjectNew() {
  const navigate = useNavigate()
  const location = useLocation()
  const incoming = (location.state as ProjectBasicInfo | null) ?? null

  const [form, setForm] = useState<FormState>(() => {
    if (incoming) {
      return {
        name: incoming.name,
        handover_date: incoming.handover_date ?? '',
        deadline: incoming.deadline,
        construction_unit: incoming.construction_unit ?? '',
        handover_person: incoming.handover_person ?? '',
        receiving_unit: incoming.receiving_unit ?? '',
        receiving_person: incoming.receiving_person ?? '',
      }
    }
    return defaultForm()
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  )

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) {
      next.name = '项目名称不能为空'
    } else if (form.name.length > 200) {
      next.name = '项目名称不能超过 200 字符'
    }
    if (!form.deadline) {
      next.deadline = '截止日期不能为空'
    } else {
      if (form.handover_date && form.deadline < form.handover_date) {
        next.deadline = '截止日期不可早于移交日期'
      } else if (form.deadline < todayISO()) {
        next.deadline = '截止日期不可早于今天'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validate()) return

    const basic: ProjectBasicInfo = {
      name: form.name.trim(),
      handover_date: form.handover_date || null,
      deadline: form.deadline,
      construction_unit: emptyToNull(form.construction_unit),
      handover_person: emptyToNull(form.handover_person),
      receiving_unit: emptyToNull(form.receiving_unit),
      receiving_person: emptyToNull(form.receiving_person),
    }
    navigate('/projects/new/template', { state: basic })
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* ============ Header ============ */}
      <header className="mb-6">
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回项目列表
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">新建项目</h1>
        <p className="mt-1 text-sm text-gray-500">
          第 1 步 / 共 2 步 — 填写项目基本信息
        </p>

        {/* 步骤指示 */}
        <ol className="mt-4 flex items-center gap-2 text-sm">
          <li className="flex items-center gap-2 font-semibold text-blue-600">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
              1
            </span>
            项目信息
          </li>
          <span className="text-gray-300">→</span>
          <li className="flex items-center gap-2 text-gray-400">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs">
              2
            </span>
            资料项选择
          </li>
        </ol>
      </header>

      {/* ============ Form ============ */}
      <form onSubmit={handleNext} className="card space-y-5 p-6" noValidate>
        {/* 错误摘要 */}
        {Object.keys(errors).length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>请修正表单中标红的字段后再继续。</div>
          </div>
        )}

        {/* 项目名称 */}
        <Field label="项目名称" required error={errors.name}>
          <input
            type="text"
            className="input"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="例如：XX 高速 2024 路面工程"
            maxLength={200}
            required
            autoFocus
          />
        </Field>

        {/* 日期行 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="移交日期" error={errors.handover_date}>
            <input
              type="date"
              className="input"
              value={form.handover_date}
              onChange={(e) => update('handover_date', e.target.value)}
            />
          </Field>

          <Field label="截止日期" required error={errors.deadline}>
            <input
              type="date"
              className="input"
              value={form.deadline}
              onChange={(e) => update('deadline', e.target.value)}
              min={form.handover_date || todayISO()}
              required
            />
          </Field>
        </div>

        {/* 移交方 */}
        <fieldset className="space-y-4 border-t border-gray-100 pt-4">
          <legend className="text-sm font-semibold text-gray-700">移交方</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="建设管理单位">
              <input
                type="text"
                className="input"
                value={form.construction_unit}
                onChange={(e) => update('construction_unit', e.target.value)}
                placeholder="例如：XX 交投集团"
                maxLength={200}
              />
            </Field>
            <Field label="移交人">
              <input
                type="text"
                className="input"
                value={form.handover_person}
                onChange={(e) => update('handover_person', e.target.value)}
                placeholder="例如：张三"
                maxLength={100}
              />
            </Field>
          </div>
        </fieldset>

        {/* 接收方 */}
        <fieldset className="space-y-4 border-t border-gray-100 pt-4">
          <legend className="text-sm font-semibold text-gray-700">接收方</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="接收单位">
              <input
                type="text"
                className="input"
                value={form.receiving_unit}
                onChange={(e) => update('receiving_unit', e.target.value)}
                placeholder="例如：结算中心"
                maxLength={200}
              />
            </Field>
            <Field label="接收人">
              <input
                type="text"
                className="input"
                value={form.receiving_person}
                onChange={(e) => update('receiving_person', e.target.value)}
                placeholder="例如：李四"
                maxLength={100}
              />
            </Field>
          </div>
        </fieldset>

        {/* 操作 */}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Link to="/" className="btn-secondary">
            取消
          </Link>
          <button type="submit" className="btn-primary">
            下一步：选择资料项
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}

// ============= 子组件 =============

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

function Field({ label, required, error, children }: FieldProps) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}
