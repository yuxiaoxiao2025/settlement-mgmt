/**
 * 新建项目 — 第 2 步：选择 / 添加资料项（v0.3.0 起独立页面）
 *
 * 流程：
 *   1. 从 location.state 读取第 1 步填的项目基本信息（ProjectBasicInfo）
 *   2. 加载全局模版（GET /api/template），用户勾选需要的项
 *   3. 也可在当前页"添加新项"（仅本次项目用，不写入全局模版）
 *   4. 点「上一步」回 /projects/new；点「创建项目」统一提交：
 *        a. POST /api/projects 带 selected_template_seqs（勾选的全局项）
 *        b. 拿到 project.id 后，循环 POST /api/projects/{id}/items 加第 2 页临时添加的项
 *
 * 顶部步骤指示：第 1 步完成（灰）/ 第 2 步进行中（蓝）
 * 顶部数据：项目名 + 截止日期（从 state 读，提醒用户是哪个项目）
 *
 * 模板选择区：
 *   - 加载全局模版 GET /api/template
 *   - 多选复选框，每行带"序号+名称+描述+默认/扩展徽章"
 *   - 快捷操作：[全选] [全不选] [反选] [只选默认项]
 *   - 顶部"添加新项"输入框（折叠展开），提交后插入到列表最下方（标记为"本次新增"）
 *   - 勾选状态：全局项（含 seq）+ 本次新增项（无 seq，用临时 id）
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckSquare,
  Square,
  ListChecks,
  Plus,
  X,
  Save,
  FileText,
  ArrowUp,
} from 'lucide-react'

import { useCreateProject } from '@/hooks/useProjects'
import { addItem } from '@/api/items'
import { getTemplate } from '@/api/template'
import { clearDraft } from '@/lib/project-draft'
import { useAppStore } from '@/store/app'
import type {
  ProjectBasicInfo,
  ProjectCreatePayload,
  Template,
  TemplateItem,
} from '@/types'

// 第 2 页临时加的项（无 seq，用本地临时 id 标记）
interface TempItem {
  tempId: string
  name: string
  description: string | null
}

function genTempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function ProjectNewTemplate() {
  const navigate = useNavigate()
  const location = useLocation()
  const create = useCreateProject()
  const pushToast = useAppStore((s) => s.pushToast)

  // 第 1 步传递的草稿
  const basic = (location.state as ProjectBasicInfo | null) ?? null

  // 模板数据
  const [template, setTemplate] = useState<Template | null>(null)
  const [templateLoading, setTemplateLoading] = useState(true)

  // 选中状态：seq（全局项） + tempId（临时项）
  const [selectedGlobalSeqs, setSelectedGlobalSeqs] = useState<Set<number>>(
    new Set(),
  )
  const [tempItems, setTempItems] = useState<TempItem[]>([])
  const [selectedTempIds, setSelectedTempIds] = useState<Set<string>>(
    new Set(),
  )

  // 添加新项表单
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  // 提交
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ─────────────── 加载模版 ───────────────
  useEffect(() => {
    let cancelled = false
    setTemplateLoading(true)
    getTemplate()
      .then((t) => {
        if (cancelled) return
        setTemplate(t)
        // 默认全选
        setSelectedGlobalSeqs(new Set(t.items.map((it) => it.seq)))
      })
      .catch((e) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('加载模版失败', e)
        }
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ─────────────── 守卫：第 1 步没填 ───────────────
  // 如果用户直接打开 /projects/new/template（无 state），重定向回第 1 步
  useEffect(() => {
    if (!basic) {
      // eslint-disable-next-line no-console
      console.warn('无项目基本信息，重定向到第 1 步')
      navigate('/projects/new', { replace: true })
    }
  }, [basic, navigate])

  if (!basic) {
    return null
  }

  // ─────────────── 派生数据 ───────────────
  const allGlobalSeqs = useMemo(
    () => (template?.items ?? []).map((it) => it.seq),
    [template],
  )
  const totalSelected =
    selectedGlobalSeqs.size + selectedTempIds.size
  const isAllSelected =
    !templateLoading &&
    totalSelected === allGlobalSeqs.length + tempItems.length &&
    totalSelected > 0
  const isNoneSelected = totalSelected === 0

  // ─────────────── 操作 ───────────────
  const toggleGlobal = (seq: number) => {
    setSelectedGlobalSeqs((prev) => {
      const next = new Set(prev)
      if (next.has(seq)) next.delete(seq)
      else next.add(seq)
      return next
    })
  }
  const toggleTemp = (tempId: string) => {
    setSelectedTempIds((prev) => {
      const next = new Set(prev)
      if (next.has(tempId)) next.delete(tempId)
      else next.add(tempId)
      return next
    })
  }
  const selectAll = () => {
    setSelectedGlobalSeqs(new Set(allGlobalSeqs))
    setSelectedTempIds(new Set(tempItems.map((t) => t.tempId)))
  }
  const selectNone = () => {
    setSelectedGlobalSeqs(new Set())
    setSelectedTempIds(new Set())
  }
  const invertSelection = () => {
    setSelectedGlobalSeqs(
      new Set(allGlobalSeqs.filter((s) => !selectedGlobalSeqs.has(s))),
    )
    setSelectedTempIds(
      new Set(tempItems.filter((t) => !selectedTempIds.has(t.tempId)).map((t) => t.tempId)),
    )
  }
  const selectDefaultsOnly = () => {
    if (!template) return
    setSelectedGlobalSeqs(
      new Set(template.items.filter((it) => it.is_default).map((it) => it.seq)),
    )
    // 临时项保留选中状态
  }

  // 添加新项
  const handleAddTemp = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) {
      pushToast('error', '请填写资料名称')
      return
    }
    // 查重
    const existsInGlobal = template?.items.some(
      (it) => it.name === name,
    )
    const existsInTemp = tempItems.some((t) => t.name === name)
    if (existsInGlobal || existsInTemp) {
      pushToast('error', `"${name}" 已存在于列表中`)
      return
    }
    const t: TempItem = {
      tempId: genTempId(),
      name,
      description: newDesc.trim() || null,
    }
    setTempItems((prev) => [...prev, t])
    setSelectedTempIds((prev) => new Set(prev).add(t.tempId))
    setNewName('')
    setNewDesc('')
    setShowAddForm(false)
    pushToast('success', `已添加临时项「${name}」（如需长期保留，请到「模版管理」推广到全局）`)
  }
  const removeTemp = (tempId: string) => {
    setTempItems((prev) => prev.filter((t) => t.tempId !== tempId))
    setSelectedTempIds((prev) => {
      const next = new Set(prev)
      next.delete(tempId)
      return next
    })
  }

  // 上一步
  const handleBack = () => {
    navigate('/projects/new', { state: basic })
  }

  // 提交
  const handleSubmit = async () => {
    setSubmitError(null)
    if (isNoneSelected) {
      const ok = window.confirm(
        '没有勾选任何资料项，将创建一个空项目（项目下没有任何子文件夹）。\n确定继续吗？',
      )
      if (!ok) return
    }
    setSubmitting(true)
    try {
      // 1) 创建项目
      const payload: ProjectCreatePayload = {
        name: basic.name,
        handover_date: basic.handover_date,
        deadline: basic.deadline,
        construction_unit: basic.construction_unit,
        handover_person: basic.handover_person,
        receiving_unit: basic.receiving_unit,
        receiving_person: basic.receiving_person,
        selected_template_seqs: Array.from(selectedGlobalSeqs).sort(
          (a, b) => a - b,
        ),
      }
      const project = await create.mutateAsync(payload)
      // 创建成功 → 清 sessionStorage 草稿（修 I-state）
      clearDraft()
      // 2) 加临时项（按用户勾选顺序）
      const tempIdOrder = Array.from(selectedTempIds)
      for (const tempId of tempIdOrder) {
        const t = tempItems.find((x) => x.tempId === tempId)
        if (!t) continue
        try {
          await addItem(project.id, {
            name: t.name,
            description: t.description,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          pushToast('error', `「${t.name}」添加失败：${msg}`)
        }
      }
      const totalCount = selectedGlobalSeqs.size + selectedTempIds.size
      pushToast('success', `项目「${project.name}」已创建（${totalCount} 项资料）`)
      navigate(`/projects/${project.id}`, { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSubmitError(msg)
      pushToast('error', `创建失败：${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* ============ Header ============ */}
      <header className="mb-6">
        <button
          type="button"
          onClick={handleBack}
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          上一步：项目信息
        </button>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">选择资料项</h1>
            <p className="mt-1 text-sm text-gray-500">
              第 2 步 / 共 2 步 — 为「
              <span className="font-medium text-gray-700">{basic.name}</span>
              」勾选需要的资料项
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>
              截止：
              <span className="font-medium text-gray-700">
                {basic.deadline}
              </span>
            </div>
            <div className="mt-0.5">
              移交：
              {basic.construction_unit || '—'}
            </div>
          </div>
        </div>

        {/* 步骤指示 */}
        <ol className="mt-4 flex items-center gap-2 text-sm">
          <li className="flex items-center gap-2 text-gray-400">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs">
              1
            </span>
            项目信息
            <span className="text-gray-300">✓</span>
          </li>
          <span className="text-gray-300">→</span>
          <li className="flex items-center gap-2 font-semibold text-blue-600">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
              2
            </span>
            资料项选择
          </li>
        </ol>
      </header>

      {/* ============ Toolbar ============ */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={selectAll}
            disabled={isAllSelected || templateLoading}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="勾选全部项（含本次新增的临时项）"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            全选
          </button>
          <button
            type="button"
            onClick={selectNone}
            disabled={isNoneSelected}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Square className="h-3.5 w-3.5" />
            全不选
          </button>
          <button
            type="button"
            onClick={invertSelection}
            disabled={templateLoading}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ListChecks className="h-3.5 w-3.5" />
            反选
          </button>
          <button
            type="button"
            onClick={selectDefaultsOnly}
            disabled={templateLoading || !template?.items.some((it) => it.is_default)}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="仅保留标准交接清单的项（去除历史扩展项）"
          >
            只选默认项
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`text-sm ${
              isNoneSelected ? 'text-amber-600' : 'text-gray-600'
            }`}
          >
            已选{' '}
            <span className="font-bold tabular-nums">{totalSelected}</span>{' '}
            项
            {tempItems.length > 0 && (
              <span className="ml-1 text-xs text-gray-400">
                （含 {tempItems.length} 个本次新增）
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            添加新项
          </button>
        </div>
      </div>

      {/* 添加新项表单（折叠） */}
      {showAddForm && (
        <form
          onSubmit={handleAddTemp}
          className="card mb-4 border-blue-200 bg-blue-50/40 p-4"
        >
          <h2 className="mb-2 text-sm font-semibold text-gray-800">
            为本次项目添加新资料项
          </h2>
          <p className="mb-3 text-xs text-gray-500">
            添加的项仅在本次项目中使用。 如需长期保留作为新标准项，请到「
            <Link
              to="/template"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              模版管理
            </Link>
            」页推广到全局。
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                资料名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={200}
                placeholder="例如：BIM 模型"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                描述（可选）
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={500}
                placeholder="例如：项目 BIM 三维模型文件"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <Save className="h-3.5 w-3.5" />
              添加
            </button>
          </div>
        </form>
      )}

      {/* 后端错误 */}
      {submitError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            创建失败：
            {submitError}
          </div>
        </div>
      )}

      {/* ============ 列表 ============ */}
      <div className="card overflow-hidden p-0">
        {templateLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">
            <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            加载模版中…
          </div>
        ) : !template || template.items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">
            模版为空，请到「模版管理」页添加项
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {/* 全局模版项 */}
            {template.items.map((it) => (
              <TemplateRow
                key={`g-${it.seq}`}
                seq={it.seq}
                name={it.name}
                description={it.description}
                isDefault={it.is_default}
                isTemp={false}
                checked={selectedGlobalSeqs.has(it.seq)}
                onToggle={() => toggleGlobal(it.seq)}
              />
            ))}
            {/* 本次新增的临时项 */}
            {tempItems.length > 0 && (
              <>
                <li className="bg-amber-50/60 px-4 py-1.5 text-xs font-medium text-amber-700">
                  ── 本次新增（不写入全局模版） ──
                </li>
                {tempItems.map((t) => (
                  <TemplateRow
                    key={t.tempId}
                    seq={null}
                    name={t.name}
                    description={t.description}
                    isDefault={false}
                    isTemp={true}
                    checked={selectedTempIds.has(t.tempId)}
                    onToggle={() => toggleTemp(t.tempId)}
                    onRemove={() => removeTemp(t.tempId)}
                  />
                ))}
              </>
            )}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        提示：小项目可能只要部分资料项（只勾关键的）；大项目可全选 + 在上方「添加新项」补充。
        <br />
        勾选项对应项目下自动创建的子文件夹（如 01_招标文件 / 02_中标通知书…）。
      </p>

      {/* ============ Footer 按钮 ============ */}
      <div className="mt-6 flex items-center justify-between gap-2">
        <Link
          to="/"
          className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
        >
          取消
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="btn-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            上一步
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary"
            title={
              isNoneSelected
                ? '没有勾任何项 → 创建空项目'
                : `创建项目，共 ${totalSelected} 项资料`
            }
          >
            {submitting ? (
              <>创建中…</>
            ) : isNoneSelected ? (
              <>
                <ArrowUp className="h-4 w-4" />
                创建空项目
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4" />
                创建项目（{totalSelected} 项）
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= 行组件 =============

interface TemplateRowProps {
  seq: number | null
  name: string
  description: string | null
  isDefault: boolean
  isTemp: boolean
  checked: boolean
  onToggle: () => void
  onRemove?: () => void
}

function TemplateRow({
  seq,
  name,
  description,
  isDefault,
  isTemp,
  checked,
  onToggle,
  onRemove,
}: TemplateRowProps) {
  return (
    <li>
      <label
        className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${
          checked ? 'bg-blue-50/40' : ''
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-gray-400">
          {seq !== null ? String(seq).padStart(2, '0') : '＋'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{name}</span>
            {isTemp ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                本次新增
              </span>
            ) : isDefault ? (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                默认
              </span>
            ) : (
              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                扩展
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRemove()
            }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            aria-label={`移除临时项 ${name}`}
            title="移除（不加入本次项目）"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
    </li>
  )
}
