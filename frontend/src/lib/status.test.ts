/**
 * lib/status.test.ts — ⑦ 测试阶段（方案 ① lib 最小补）
 *
 * 覆盖 src/lib/status.ts 的 3 个状态映射表 + 3 个 getter + 1 个 tone 表：
 *   ITEM_STATUS / getItemStatusStyle / ITEM_STATUS_LIST
 *   PROJECT_STATUS / getProjectStatusStyle
 *   SETTLEMENT_STATUS / getSettlementStatusStyle
 *   DEADLINE_TONE_CLASS
 *
 * 全部为静态表 + 纯函数查询。
 */
import { describe, it, expect } from 'vitest'
import {
  ITEM_STATUS,
  ITEM_STATUS_LIST,
  getItemStatusStyle,
  PROJECT_STATUS,
  getProjectStatusStyle,
  SETTLEMENT_STATUS,
  getSettlementStatusStyle,
  DEADLINE_TONE_CLASS,
} from './status'
import type {
  ItemStatus,
  ProjectStatus,
  SettlementJobStatus,
} from '@/types'

describe('ITEM_STATUS', () => {
  it('has 4 entries: pending / uploaded / confirmed / rejected', () => {
    expect(Object.keys(ITEM_STATUS).sort()).toEqual(
      ['confirmed', 'pending', 'rejected', 'uploaded'],
    )
  })
  it('every entry has the 4 contract fields {color, bg, label, icon}', () => {
    for (const [k, v] of Object.entries(ITEM_STATUS)) {
      expect(v, k).toHaveProperty('color')
      expect(v, k).toHaveProperty('bg')
      expect(v, k).toHaveProperty('label')
      expect(v, k).toHaveProperty('icon')
    }
  })
  it('pending is gray', () => {
    expect(ITEM_STATUS.pending.color).toContain('gray')
    expect(ITEM_STATUS.pending.label).toBe('未开始')
  })
  it('uploaded is blue', () => {
    expect(ITEM_STATUS.uploaded.color).toContain('blue')
    expect(ITEM_STATUS.uploaded.label).toBe('已上传')
  })
  it('confirmed is green', () => {
    expect(ITEM_STATUS.confirmed.color).toContain('green')
    expect(ITEM_STATUS.confirmed.label).toBe('已确认')
  })
  it('rejected is red', () => {
    expect(ITEM_STATUS.rejected.color).toContain('red')
    expect(ITEM_STATUS.rejected.label).toBe('已驳回')
  })
})

describe('getItemStatusStyle', () => {
  it('returns the correct style for each known status', () => {
    expect(getItemStatusStyle('pending')).toBe(ITEM_STATUS.pending)
    expect(getItemStatusStyle('uploaded')).toBe(ITEM_STATUS.uploaded)
    expect(getItemStatusStyle('confirmed')).toBe(ITEM_STATUS.confirmed)
    expect(getItemStatusStyle('rejected')).toBe(ITEM_STATUS.rejected)
  })
  it('falls back to pending for unknown status', () => {
    const fake = 'whatever' as unknown as ItemStatus
    expect(getItemStatusStyle(fake)).toBe(ITEM_STATUS.pending)
  })
})

describe('ITEM_STATUS_LIST', () => {
  it('contains all 4 statuses in fixed order', () => {
    expect(ITEM_STATUS_LIST).toEqual([
      'pending',
      'uploaded',
      'confirmed',
      'rejected',
    ])
  })
  it('has the same length as ITEM_STATUS keys', () => {
    expect(ITEM_STATUS_LIST.length).toBe(Object.keys(ITEM_STATUS).length)
  })
})

describe('PROJECT_STATUS', () => {
  it('has 2 entries: active / archived', () => {
    expect(Object.keys(PROJECT_STATUS).sort()).toEqual(['active', 'archived'])
  })
  it('active is green + 进行中', () => {
    expect(PROJECT_STATUS.active.color).toContain('green')
    expect(PROJECT_STATUS.active.label).toBe('进行中')
  })
  it('archived is gray + 已归档', () => {
    expect(PROJECT_STATUS.archived.color).toContain('gray')
    expect(PROJECT_STATUS.archived.label).toBe('已归档')
  })
})

describe('getProjectStatusStyle', () => {
  it('returns correct style for active', () => {
    expect(getProjectStatusStyle('active')).toBe(PROJECT_STATUS.active)
  })
  it('returns correct style for archived', () => {
    expect(getProjectStatusStyle('archived')).toBe(PROJECT_STATUS.archived)
  })
  it('falls back to active for unknown', () => {
    const fake = 'unknown' as unknown as ProjectStatus
    expect(getProjectStatusStyle(fake)).toBe(PROJECT_STATUS.active)
  })
})

describe('SETTLEMENT_STATUS', () => {
  it('has 4 entries: idle / running / success / failed', () => {
    expect(Object.keys(SETTLEMENT_STATUS).sort()).toEqual([
      'failed',
      'idle',
      'running',
      'success',
    ])
  })
  it('idle is gray + 尚未生成', () => {
    expect(SETTLEMENT_STATUS.idle.label).toBe('尚未生成')
  })
  it('running is blue + 生成中', () => {
    expect(SETTLEMENT_STATUS.running.color).toContain('blue')
    expect(SETTLEMENT_STATUS.running.label).toBe('生成中')
  })
  it('success is green + 已生成', () => {
    expect(SETTLEMENT_STATUS.success.color).toContain('green')
    expect(SETTLEMENT_STATUS.success.label).toBe('已生成')
  })
  it('failed is red + 失败', () => {
    expect(SETTLEMENT_STATUS.failed.color).toContain('red')
    expect(SETTLEMENT_STATUS.failed.label).toBe('失败')
  })
})

describe('getSettlementStatusStyle', () => {
  it('returns correct style for each known status', () => {
    for (const s of ['idle', 'running', 'success', 'failed'] as SettlementJobStatus[]) {
      expect(getSettlementStatusStyle(s)).toBe(SETTLEMENT_STATUS[s])
    }
  })
  it('falls back to idle for unknown', () => {
    const fake = 'whatever' as unknown as SettlementJobStatus
    expect(getSettlementStatusStyle(fake)).toBe(SETTLEMENT_STATUS.idle)
  })
})

describe('DEADLINE_TONE_CLASS', () => {
  it('has 5 entries: urgent / soon / normal / overdue / done', () => {
    expect(Object.keys(DEADLINE_TONE_CLASS).sort()).toEqual([
      'done',
      'normal',
      'overdue',
      'soon',
      'urgent',
    ])
  })
  it('every entry has {text, border, bg} contract', () => {
    for (const [k, v] of Object.entries(DEADLINE_TONE_CLASS)) {
      expect(v, k).toHaveProperty('text')
      expect(v, k).toHaveProperty('border')
      expect(v, k).toHaveProperty('bg')
    }
  })
  it('urgent is red, overdue is darker red, soon is orange', () => {
    expect(DEADLINE_TONE_CLASS.urgent.text).toContain('red')
    expect(DEADLINE_TONE_CLASS.overdue.text).toContain('red-700')
    expect(DEADLINE_TONE_CLASS.soon.text).toContain('orange')
  })
  it('normal is gray, done is gray (less urgent)', () => {
    expect(DEADLINE_TONE_CLASS.normal.text).toContain('gray')
    expect(DEADLINE_TONE_CLASS.done.text).toContain('gray')
  })
})
