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
 *   - selected_template_seqs 选填（List[int]，新增）— 新建时只建勾选的模板项
 *
 * 模板选择区：
 *   - 加载全局模版 GET /api/template
 *   - 多选复选框，每行带"序号+名称+描述+默认/扩展徽章"
 *   - 快捷操作：[全选] [全不选] [反选] [只选默认项]
 *   - 不勾任何项 = 0 项项目（用户可以纯自定义）
 *   - 默认行为：进页面时**全选**
 *
 * 提交：
 *   - useCreateProject mutation，传 selected_template_seqs
 *   - 成功后 navigate('/projects/:id')
 *   - 失败显示后端 detail
 *
 * 客户端预校验（SPEC-PR-2）：
 *   - 截止日期 ≥ 移交日期
 *   - 截止日期 ≥ 今天
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Save, AlertCircle, CheckSquare, Square, ListChecks } from 'lucide-react'

import { useCreateProject } from '@/hooks/useProjects'
import { getTemplate } from '@/api/template'
import { emptyToNull } from '@/lib/format'
import type { ProjectCreatePayload, Template, TemplateItem } from '@/types'

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

  // 模板数据 + 选中状态
  const [template, setTemplate] = useState<Template | null>(null)
  const [templateLoading, setTemplateLoading] = useState(true)
  const [selectedSeqs, setSelectedSeqs] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    setTemplateLoading(true)
    getTemplate()
      .then((t) => {
        if (cancelled) return
        setTemplate(t)
        // 默认全选
        setSelectedSeqs(new Set(t.items.map((it) => it.seq)))
      })
      .catch((e) => {
        if (cancelled) return
        // 加载失败不阻塞项目创建（后端会兜底建全量）
        // eslint-disable-next-line no-console
        console.error('加载模版失败', e)
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // ─── 复选框操作 ───
  const allSeqs = useMemo(
    () => (template?.items ?? []).map((it) => it.seq),
    [template],
  )
  const isAllSelected =
    !templateLoading && allSeqs.length > 0 && selectedSeqs.size === allSeqs.length
  const isNoneSelected = selectedSeqs.size === 0

  const toggleOne = (seq: number) => {
    setSelectedSeqs((prev) => {
      const next = new Set(prev)
      if (next.has(seq)) next.delete(seq)
      else next.add(seq)
      return next
    })
  }

  const selectAll = () => setSelectedSeqs(new Set(allSeqs))
  const selectNone = () => setSelectedSeqs(new Set())
  const invertSelection = () => {
    setSelectedSeqs(
      new Set(allSeqs.filter((s) => !selectedSeqs.has(s))),
    )
  }
  const selectDefaultsOnly = () => {
    if (!template) return
    setSelectedSeqs(
      new Set(template.items.filter((it) => it.is_default).map((it) => it.seq)),
    )
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
      // 模板选择：只有用户显式操作过（点了全选/全不选/反选/只选默认/手动勾）才传 selected_template_seqs
      // — 否则不传，沿用后端兜底（建全量）
      // 实现：始终传，传空数组 = 一个都不建（这是用户明确选的）
      selected_template_seqs: Array.from(selectedSeqs).sort((a, b) => a - b),
    }

    try {
      const project = await create.mutateAsync(payload)
      // 成功后跳到项目详情
      navigate(`/projects/${project.id}`)
    } catch (err) {
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
          填写项目基本信息，并从标准模版中选择本项目需要的资料项。
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

        {/* 模板选择 */}
        <fieldset className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold text-gray-700">
              资料项模板
              <span className="ml-2 text-xs font-normal text-gray-500">
                （已选{' '}
                <span className="font-semibold text-gray-900">
                  {selectedSeqs.size}
                </span>{' '}
                / {allSeqs.length} 项）
              </span>
            </legend>
          </div>

          {/* 快捷操作 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              disabled={isAllSelected || templateLoading}
              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="勾选全部模板项"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              全选
            </button>
            <button
              type="button"
              onClick={selectNone}
              disabled={isNoneSelected}
              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="取消所有勾选（创建空项目）"
            >
              <Square className="h-3.5 w-3.5" />
              全不选
            </button>
            <button
              type="button"
              onClick={invertSelection}
              disabled={templateLoading || allSeqs.length === 0}
              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="反选：勾上的变不勾，不勾的变勾上"
            >
              <ListChecks className="h-3.5 w-3.5" />
              反选
            </button>
            <button
              type="button"
              onClick={selectDefaultsOnly}
              disabled={
                templateLoading ||
                !template?.items.some((it) => it.is_default)
              }
              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="仅保留标准交接清单的项（去除历史扩展项）"
            >
              只选默认项
            </button>
            <span className="ml-auto text-xs text-gray-400">
              {isNoneSelected
                ? '⚠ 不勾任何项将创建空项目（可后续手动添加）'
                : isAllSelected
                ? '✓ 全部勾选'
                : `已勾选 ${selectedSeqs.size} 项`}
            </span>
          </div>

          {/* 模板项列表 */}
          <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-gray-50/50 p-2">
            {templateLoading ? (
              <div className="p-4 text-center text-sm text-gray-500">
                加载模版中…
              </div>
            ) : !template || template.items.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                模版为空，请到「模版管理」页添加项
              </div>
            ) : (
              <ul className="space-y-1">
                {template.items.map((it) => (
                  <TemplateCheckboxRow
                    key={it.seq}
                    item={it}
                    checked={selectedSeqs.has(it.seq)}
                    onToggle={() => toggleOne(it.seq)}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-gray-500">
            提示：小项目可能只要部分资料项（只勾关键的）；大项目可全选 + 项目内手动添加扩展项。
            <br />
            勾选项对应项目下自动创建的子文件夹（如 01_招标文件 / 02_中标通知书…）。
          </p>
        </fieldset>

        {/* 操作 */}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Link to="/" className="btn-secondary">
            取消
          </Link>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            title={
              isNoneSelected
                ? '将创建一个空项目（没有资料项），确定吗？'
                : undefined
            }
          >
            <Save className="h-4 w-4" />
            {submitting
              ? '创建中…'
              : isNoneSelected
              ? '创建空项目'
              : `创建项目（${selectedSeqs.size} 项）`}
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

interface TemplateCheckboxRowProps {
  item: TemplateItem
  checked: boolean
  onToggle: () => void
}

function TemplateCheckboxRow({ item, checked, onToggle }: TemplateCheckboxRowProps) {
  return (
    <li>
      <label
        className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-white ${
          checked ? 'bg-blue-50/60' : ''
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-gray-400">
          {String(item.seq).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {item.name}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                item.is_default
                  ? 'bg-green-100 text-green-700'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {item.is_default ? '默认' : '扩展'}
            </span>
          </div>
          {item.description && (
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {item.description}
            </p>
          )}
        </div>
      </label>
    </li>
  )
}
