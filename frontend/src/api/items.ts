/**
 *资料项（Item）API封装。
 *
 *端点清单（与 backend/app/routers/items.py 对齐）：
 * - GET /api/projects/{projectId}/items
 * - POST /api/projects/{projectId}/items （新增项 + 可能触发推广提示）
 * - PATCH /api/items/{itemId} （仅用于编辑 name/description/pages，**禁止**改 status）
 * - DELETE /api/items/{itemId}
 * - POST /api/items/{itemId}/confirm （uploaded → confirmed）
 * - POST /api/items/{itemId}/reject （uploaded → rejected，需 note）
 * - POST /api/items/{itemId}/reset （rejected/confirmed-with-no-files → pending）
 *
 *状态机（SPEC §2.1）：
 * pending → uploaded → confirmed
 * └→ rejected → pending
 *
 * 前端契约：
 * -任何 status变更 MUST走 confirm / reject / reset端点，**禁止**直接 PATCH status
 * - 见本文件 `patchItem()` 的注释
 */
import { apiClient } from './client';
import type { Item, ItemListResponse, ItemStatus, TemplateItem } from '../types';

/** 新增项的请求体 */
export interface AddItemPayload {
 name: string;
 description?: string | null;
 pages?: number | null;
}

/** 新增项的响应（带 promote提示） */
export interface AddItemResponse extends Item {
 promote_available?: boolean;
 promote_prompt?: {
 available: boolean;
 message: string;
 preview: TemplateItem;
 };
}

/** 编辑项的请求体（PATCH /api/items/{id}，不包含 status） */
export interface UpdateItemPayload {
 name?: string;
 description?: string | null;
 pages?: number | null;
}

/**复核通过的请求体 */
export interface ConfirmPayload {
 /** 主文件 ID；不传则后端自动选第一个 PDF */
 primary_file_id?: string | null;
}

/**驳回的请求体 */
export interface RejectPayload {
 /**驳回备注（必填，后端 RejectRequest强制 min_length=1） */
 note: string;
}

/**
 * 列出一个项目下所有 item + 未认领文件。
 * 注意：响应包含 `unclaimed`，但实际归属逻辑在 ProjectDetail 里通过 ItemListResponse一起拿到。
 */
export async function listItems(projectId: string): Promise<ItemListResponse> {
  const { data } = await apiClient.get<ItemListResponse>(
    `/projects/${encodeURIComponent(projectId)}/items`,
  );
  return data;
}

/**
 * 新增一项（项目级扩展项）。后端返回201 + ItemResponse，可能带 promote_available标志。
 */
export async function addItem(
  projectId: string,
  payload: AddItemPayload,
): Promise<AddItemResponse> {
  const { data } = await apiClient.post<AddItemResponse>(
    `/projects/${encodeURIComponent(projectId)}/items`,
    payload,
  );
  return data;
}

/**
 * 编辑项的元信息（name/description/pages）。
 *
 * ⚠️ SPEC-ST-1 / SPEC-ST-2 / SPEC-ST-5：前端**禁止**通过此端点改 status。
 * 如需状态变更，必须走 confirm / reject / reset专用端点。
 */
export async function updateItem(
  itemId: string,
  payload: UpdateItemPayload,
): Promise<Item> {
  const { data } = await apiClient.patch<Item>(
    `/items/${encodeURIComponent(itemId)}`,
    payload,
  );
  return data;
}

/** 删除一个项（级联文件）。 */
export async function deleteItem(itemId: string): Promise<void> {
  await apiClient.delete(`/items/${encodeURIComponent(itemId)}`);
}

/**
 *复核通过（uploaded → confirmed）。
 *
 * @param itemId资料项 ID
 * @param primaryFileId 主文件 ID；不传则后端自动选第一个
 */
export async function confirmItem(
  itemId: string,
  primaryFileId?: string | null,
): Promise<Item> {
  const payload: ConfirmPayload = {};
  if (primaryFileId) payload.primary_file_id = primaryFileId;
  const { data } = await apiClient.post<Item>(
    `/items/${encodeURIComponent(itemId)}/confirm`,
    payload,
  );
  return data;
}

/**
 *驳回（uploaded → rejected）。
 * 必须提供驳回备注。
 */
export async function rejectItem(itemId: string, note: string): Promise<Item> {
  const { data } = await apiClient.post<Item>(
    `/items/${encodeURIComponent(itemId)}/reject`,
    { note },
  );
  return data;
}

/**
 * 重置为 pending（rejected / confirmed-with-no-files → pending）。
 * 通常用于驳回后允许重新上传，或管理员强制重置。
 */
export async function resetItem(itemId: string): Promise<Item> {
  const { data } = await apiClient.post<Item>(
    `/items/${encodeURIComponent(itemId)}/reset`,
  );
  return data;
}

/** 类型守卫：合法的 ItemStatus */
export function isItemStatus(s: string): s is ItemStatus {
 return s === 'pending' || s === 'uploaded' || s === 'confirmed' || s === 'rejected';
}
