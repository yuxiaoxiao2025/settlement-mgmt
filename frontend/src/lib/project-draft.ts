/**
 * sessionStorage 工具 —— 2 步新建流程草稿兜底。
 *
 * 背景（修 I-state, REVIEW-TRACK2 M5 / REVIEW-TRACK3 I-state）：
 *  - 之前 /projects/new 表单数据通过 location.state 传到第 2 步，刷新即丢
 *  - 加 sessionStorage 兜底：用户填过的字段写一份，刷新或误关标签页能恢复
 *  - 注意：sessionStorage 在新标签页/隐身模式下隔离，跨标签页不共享 —— 这是有意的，避免多 tab 互相覆盖
 *
 * 类型守卫严格（不存就返 null，不抛异常）。
 */

const DRAFT_KEY = 'project-new-draft-v1'

export interface ProjectDraft {
  // 第 1 步填的基本信息
  basic: {
    name: string
    handover_date: string
    deadline: string
    construction_unit: string
    handover_person: string
    receiving_unit: string
    receiving_person: string
  }
  // 写入时间戳（用来显示"草稿 X 分钟前保存"）
  savedAt: number
}

export function loadDraft(): ProjectDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'basic' in parsed &&
      'savedAt' in parsed
    ) {
      return parsed as ProjectDraft
    }
    return null
  } catch {
    return null
  }
}

export function saveDraft(basic: ProjectDraft['basic']): void {
  if (typeof window === 'undefined') return
  try {
    const payload: ProjectDraft = { basic, savedAt: Date.now() }
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
  } catch (e) {
    // sessionStorage 满 / 隐私模式 → 静默失败（不影响主流程）
    // eslint-disable-next-line no-console
    console.warn('保存草稿失败:', e)
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}
