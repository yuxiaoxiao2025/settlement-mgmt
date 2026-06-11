/**
 * lib/format.test.ts — ⑦ 测试阶段（方案 ① lib 最小补）
 *
 * 覆盖 src/lib/format.ts 的 7 个纯函数：
 *   formatDate / formatDateTime / formatFileSize / formatDeadline /
 *   formatRelativeTime / emptyToNull / nullToEmpty
 *
 * 全部为纯函数，零 React/DOM 依赖，jsdom 都不需要。
 */
import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatDeadline,
  formatRelativeTime,
  emptyToNull,
  nullToEmpty,
} from './format'

describe('formatDate', () => {
  it('formats ISO string to YYYY-MM-DD', () => {
    expect(formatDate('2026-06-09')).toBe('2026-06-09')
  })
  it('formats Date object to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-01-05T10:00:00Z'))).toBe('2026-01-05')
  })
  it('returns — for null', () => {
    expect(formatDate(null)).toBe('—')
  })
  it('returns — for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })
  it('returns — for invalid string', () => {
    expect(formatDate('not-a-date')).toBe('—')
  })
  it('zero-pads single digit month and day', () => {
    expect(formatDate('2026-03-07')).toBe('2026-03-07')
  })
})

describe('formatDateTime', () => {
  it('combines date + zero-padded time', () => {
    // Use a Date constructed in local time so the test is timezone-stable
    const d = new Date(2026, 5, 9, 14, 30) // 2026-06-09 14:30 local
    expect(formatDateTime(d)).toBe('2026-06-09 14:30')
  })
  it('returns — for null', () => {
    expect(formatDateTime(null)).toBe('—')
  })
  it('returns — for invalid string', () => {
    expect(formatDateTime('garbage')).toBe('—')
  })
})

describe('formatFileSize', () => {
  it('formats bytes under 1024 as B', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })
  it('formats KB at 1024 boundary', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })
  it('formats MB at 1024^2 boundary', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('formats GB at 1024^3 boundary', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB')
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB')
  })
  it('returns — for null / undefined / NaN / negative', () => {
    expect(formatFileSize(null)).toBe('—')
    expect(formatFileSize(undefined)).toBe('—')
    expect(formatFileSize(NaN)).toBe('—')
    expect(formatFileSize(-1)).toBe('—')
  })
})

describe('formatDeadline', () => {
  it('returns done tone for archived project', () => {
    const r = formatDeadline('2026-12-31', 5, true)
    expect(r.tone).toBe('done')
    expect(r.text).toBe('已归档')
  })
  it('returns overdue tone with abs days for past deadline', () => {
    const r = formatDeadline('2026-01-01', -3, false)
    expect(r.tone).toBe('overdue')
    expect(r.text).toBe('已逾期 3 天')
  })
  it('returns urgent "今日截止" for 0 days', () => {
    const r = formatDeadline('2026-06-09', 0, false)
    expect(r.tone).toBe('urgent')
    expect(r.text).toBe('今日截止')
  })
  it('returns urgent for 1-3 days', () => {
    expect(formatDeadline('2026-06-12', 1, false).tone).toBe('urgent')
    expect(formatDeadline('2026-06-12', 3, false).tone).toBe('urgent')
    expect(formatDeadline('2026-06-12', 3, false).text).toBe('还剩 3 天')
  })
  it('returns soon for 4-7 days', () => {
    expect(formatDeadline('2026-06-12', 4, false).tone).toBe('soon')
    expect(formatDeadline('2026-06-12', 7, false).tone).toBe('soon')
  })
  it('returns normal for > 7 days', () => {
    expect(formatDeadline('2026-07-01', 30, false).tone).toBe('normal')
    expect(formatDeadline('2026-07-01', 30, false).text).toBe('还剩 30 天')
  })
  it('archived overrides any daysToDeadline', () => {
    const r = formatDeadline('2026-01-01', -10, true)
    expect(r.tone).toBe('done')
  })
})

describe('formatRelativeTime', () => {
  it('returns 刚刚 for < 60 sec', () => {
    const t = new Date(Date.now() - 30 * 1000).toISOString()
    expect(formatRelativeTime(t)).toBe('刚刚')
  })
  it('returns N 分钟前 for < 60 min', () => {
    const t = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(t)).toBe('5 分钟前')
  })
  it('returns N 小时前 for < 24 hr', () => {
    const t = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(t)).toBe('3 小时前')
  })
  it('falls back to date for > 24 hr', () => {
    const t = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    // expect YYYY-MM-DD format (year-agnostic, just check the dash pattern)
    expect(formatRelativeTime(t)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('returns — for null/invalid', () => {
    expect(formatRelativeTime(null)).toBe('—')
    expect(formatRelativeTime('not-a-date')).toBe('—')
  })
})

describe('emptyToNull', () => {
  it('returns null for empty string', () => {
    expect(emptyToNull('')).toBeNull()
  })
  it('returns null for whitespace-only', () => {
    expect(emptyToNull('   ')).toBeNull()
    expect(emptyToNull('\t\n')).toBeNull()
  })
  it('returns trimmed string for non-empty', () => {
    expect(emptyToNull('  hello  ')).toBe('hello')
  })
  it('preserves internal whitespace', () => {
    expect(emptyToNull('  hello world  ')).toBe('hello world')
  })
})

describe('nullToEmpty', () => {
  it('returns empty string for null', () => {
    expect(nullToEmpty(null)).toBe('')
  })
  it('returns empty string for undefined', () => {
    expect(nullToEmpty(undefined)).toBe('')
  })
  it('returns the string itself for non-null', () => {
    expect(nullToEmpty('abc')).toBe('abc')
  })
  it('returns empty string for empty string (idempotent)', () => {
    expect(nullToEmpty('')).toBe('')
  })
})
