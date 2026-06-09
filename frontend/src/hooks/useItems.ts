/**
 *资料项数据 hooks ——基于 TanStack Query。
 *
 *关键设计（SPEC §7.3 / SPEC §11）：
 * - 项目详情页 MUST 每3-5 秒轮询（CONTEXT-04 §2.2规定3s），
 * 让用户能在5 秒内看到新拖入的文件状态变化。
 * - 所有 mutation（confirm / reject / reset / 等）成功后 MUST
 * invalidate ['items', projectId] 和 ['project', projectId] 触发轮询立即刷新。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
 addItem,
 confirmItem,
 deleteItem,
 listItems,
 rejectItem,
 resetItem,
 updateItem,
 type AddItemPayload,
 type RejectPayload,
 type UpdateItemPayload,
} from '../api/items';
import type { Item, ItemListResponse } from '../types';

/** React Query key工厂 ——集中管理 cache key避免拼写错误 */
export const itemKeys = {
 all: ['items'] as const,
 byProject: (projectId: string) =>
 [...itemKeys.all, 'project', projectId] as const,
 byId: (itemId: string) => [...itemKeys.all, 'id', itemId] as const,
};

/**
 *拉取一个项目下所有 item + 未认领文件。
 * 默认每3 秒轮询（满足"5s 内必显示新增文件"）。
 */
export function useItems(projectId: string) {
 return useQuery<ItemListResponse>({
 queryKey: itemKeys.byProject(projectId),
 queryFn: () => listItems(projectId),
 // SPEC-UI-3：详情页 MUST5 秒内显示新增文件
 refetchInterval:3000,
 refetchIntervalInBackground: false, //切到其他 tab 时停轮询，节省带宽
 staleTime:1000, //1s 内不重新拉（但仍按 interval轮询）
 enabled: !!projectId,
 });
}

/** 新增一个 item */
export function useAddItem(projectId: string) {
 const qc = useQueryClient();
 return useMutation<Item, Error, AddItemPayload>({
 mutationFn: (payload) => addItem(projectId, payload),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: itemKeys.byProject(projectId) });
 qc.invalidateQueries({ queryKey: ['project', projectId] });
 },
 });
}

/** 编辑 item 的元信息（name/description/pages） */
export function useUpdateItem(projectId: string) {
 const qc = useQueryClient();
 return useMutation<Item, Error, { itemId: string; payload: UpdateItemPayload }>({
 mutationFn: ({ itemId, payload }) => updateItem(itemId, payload),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: itemKeys.byProject(projectId) });
 },
 });
}

/** 删除一个 item */
export function useDeleteItem(projectId: string) {
 const qc = useQueryClient();
 return useMutation<void, Error, string>({
 mutationFn: (itemId) => deleteItem(itemId),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: itemKeys.byProject(projectId) });
 qc.invalidateQueries({ queryKey: ['project', projectId] });
 },
 });
}

/**复核通过 */
export function useConfirmItem(projectId: string) {
 const qc = useQueryClient();
 return useMutation<Item, Error, { itemId: string; primaryFileId?: string | null }>({
 mutationFn: ({ itemId, primaryFileId }) => confirmItem(itemId, primaryFileId),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: itemKeys.byProject(projectId) });
 qc.invalidateQueries({ queryKey: ['project', projectId] });
 },
 });
}

/**驳回 */
export function useRejectItem(projectId: string) {
 const qc = useQueryClient();
 return useMutation<Item, Error, { itemId: string; note: string }>({
 mutationFn: ({ itemId, note }: { itemId: string; note: string }) =>
 rejectItem(itemId, note),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: itemKeys.byProject(projectId) });
 qc.invalidateQueries({ queryKey: ['project', projectId] });
 },
 });
}

/** 重置为 pending */
export function useResetItem(projectId: string) {
 const qc = useQueryClient();
 return useMutation<Item, Error, string>({
 mutationFn: (itemId) => resetItem(itemId),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: itemKeys.byProject(projectId) });
 qc.invalidateQueries({ queryKey: ['project', projectId] });
 },
 });
}

// 类型导出（让消费者只 import hooks文件即可拿到载荷类型）
export type { RejectPayload };
