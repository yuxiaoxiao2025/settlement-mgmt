/**
 * 新建项目页（CONTEXT-04 §2.2 ProjectCreatePayload + SPEC §3.1）
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
 * 提交：
 *   - useCreateProject mutation
 *   - 成功后 navigate('/projects/:id')
 *   - 失败显示后端 detail
 *
 * 客户端预校验（SPEC-PR-2）：
 *   - 截止日期 ≥ 移交日期
 *   - 截止日期 ≥ 今天
 */

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Save, AlertCircle } from 'lucide-react'

import { useCreateProject } from '@/hooks/useProjects'
import { emptyToNull } from '@/lib/format'
import type { ProjectCreatePayload } from '@/types'

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
  const create = useCreateProject()

  const [form, setForm] = useState<FormState>(defaultForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  )

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    // 清掉对应字段的错误
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validate()) return

    const payload: ProjectCreatePayload = {
      name: form.name.trim(),
      handover_date: form.handover_date || null,
      deadline: form.deadline,
      construction_unit: emptyToNull(form.construction_unit),
      handover_person: emptyToNull(form.handover_person),
      receiving_unit: emptyToNull(form.receiving_unit),
      receiving_person: emptyToNull(form.receiving_person),
    }

    try {
      const project = await create.mutateAsync(payload)
      // 成功后跳到项目详情
      navigate(`/projects/${project.id}`)
    } catch (err) {
      // 让 TanStack Query 暴露 error（UI 通过 create.isError 展示）
      // 此处可选择 setFormError，但简单起见只 console
      // eslint-disable-next-line no-console
      console.error('创建项目失败', err)
    }
  }

  const submitting = create.isPending
  const submitError = create.error

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
          项目创建后会自动按标准模版建立 25 项资料子文件夹。
        </p>
      </header>

      {/* ============ Form ============ */}
      <form onSubmit={handleSubmit} className="card space-y-5 p-6" noValidate>
        {/* 错误摘要 */}
        {Object.keys(errors).length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>请修正表单中标红的字段后再提交。</div>
          </div>
        )}

        {/* 后端错误 */}
        {submitError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              创建失败：
              {submitError instanceof Error ? submitError.message : '未知错误'}
            </div>
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
          <button type="submit" className="btn-primary" disabled={submitting}>
            <Save className="h-4 w-4" />
            {submitting ? '创建中…' : '创建项目'}
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
