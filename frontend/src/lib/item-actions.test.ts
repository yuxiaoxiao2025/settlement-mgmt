/**
 * lib/item-actions.test.ts — T-06 状态机纯函数测试。
 *
 * 不引入 jsdom / @testing-library；纯函数测最稳。
 */
import { describe, it, expect } from 'vitest';
import { getItemActions, type ItemStatus } from './item-actions';

describe('getItemActions', () => {
  it('pending: 显示上传按钮', () => {
    expect(getItemActions('pending')).toEqual({
      showUpload: true,
      showConfirm: false,
      showReject: false,
      showReset: false,
    });
  });

  it('uploaded: 显示复核 + 驳回', () => {
    expect(getItemActions('uploaded')).toEqual({
      showUpload: false,
      showConfirm: true,
      showReject: true,
      showReset: false,
    });
  });

  it('rejected: 显示上传 + 重置（驳回后可重传）', () => {
    expect(getItemActions('rejected')).toEqual({
      showUpload: true,
      showConfirm: false,
      showReject: false,
      showReset: true,
    });
  });

  it('confirmed: 显示重置（admin 强制重置入口）', () => {
    expect(getItemActions('confirmed')).toEqual({
      showUpload: false,
      showConfirm: false,
      showReject: false,
      showReset: true,
    });
  });

  it('未知状态: 抛错（exhaustiveness check, 编译期保证显式处理）', () => {
    const unknown = 'whatever' as ItemStatus;
    // 修 review Important 9: 未知状态不再"安全兜底返全 false",
    // 而是抛错暴露代码缺陷 — 后端加新状态时前端必须显式处理
    expect(() => getItemActions(unknown)).toThrow(/Unknown item status/);
  });

  it('所有合法状态: 互斥 + 不重复', () => {
    const statuses: ItemStatus[] = ['pending', 'uploaded', 'rejected', 'confirmed'];
    for (const s of statuses) {
      const a = getItemActions(s);
      // 关键约束: uploaded 不会有 upload（已上传不需再传）
      // 关键约束: pending 不会有 confirm/reject（还没文件可审）
      if (s === 'pending') {
        expect(a.showConfirm).toBe(false);
        expect(a.showReject).toBe(false);
      }
      if (s === 'uploaded') {
        expect(a.showUpload).toBe(false);
      }
      if (s === 'confirmed') {
        // 已确认不应允许"上传"覆盖（除非先重置）
        expect(a.showUpload).toBe(false);
      }
    }
  });
});
