/**
 * 文件（File）API封装。
 *
 *端点清单（与 backend/app/routers/files.py 对齐）：
 * - GET /api/items/{itemId}/files
 * - POST /api/items/{itemId}/refresh （手动扫描子文件夹）
 * - GET /api/files/{fileId}/preview （stream，浏览器直接打开）
 * - GET /api/files/{fileId}/download （stream，强制下载）
 * - DELETE /api/files/{fileId} （从 files 表移除；物理文件保留）
 *
 *缺失端点（已在 CONTEXT-06-T-FE-B.md标注）：
 * - POST /api/items/{itemId}/files/{fileId}/primary（SPEC §3.2列出但后端未实现）
 * 前端暂用 setPrimaryFile 调用 /confirm端点绕行（同时会 flip status → confirmed）。
 */
import { apiClient } from './client';
import type { FileInfo } from '../types';

/**列出某个 item下的所有文件 */
export async function listFiles(itemId: string): Promise<FileInfo[]> {
 const { data } = await apiClient.get<FileInfo[]>(
 `/api/items/${encodeURIComponent(itemId)}/files`,
 );
 return data;
}

/**
 *手动刷新某个 item 的文件夹扫描。
 * 用于：watchdog监听失败时回退按钮，或用户新增文件后即时触发入库。
 */
export async function refreshItem(itemId: string): Promise<{ scanned: number; added: number }> {
 const { data } = await apiClient.post<{ scanned: number; added: number }>(
 `/api/items/${encodeURIComponent(itemId)}/refresh`,
 );
 return data;
}

/**
 *预览文件 URL ——浏览器原生 <a> / window.open即可触发流式下载。
 * 使用 URL 对象而不是 fetch，避免 axios 把整个 PDF拉到内存。
 */
export function previewFileUrl(fileId: string): string {
 //走 Vite代理 /api → 后端8000
 return `/api/files/${encodeURIComponent(fileId)}/preview`;
}

/**
 * 下载文件 URL —— 同上，但 Content-Disposition: attachment。
 */
export function downloadFileUrl(fileId: string): string {
 return `/api/files/${encodeURIComponent(fileId)}/download`;
}

/**
 *触发浏览器下载文件（在已打开项目详情页时）。
 * 用隐藏的 <a download>元素，绕过 popup blocker。
 */
export function downloadFile(fileId: string, filename?: string): void {
 const a = document.createElement('a');
 a.href = downloadFileUrl(fileId);
 if (filename) a.download = filename;
 a.style.display = 'none';
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
}

/** 删除一个文件（files 表 +物理路径；不删除数据库记录）。 */
export async function deleteFile(fileId: string): Promise<void> {
 await apiClient.delete(`/api/files/${encodeURIComponent(fileId)}`);
}

/**
 * 把某个文件设为主文件（is_primary=true）。
 *
 * ⚠️ 后端未实现专用端点（SPEC §3.2 中存在但 routers/items.py 中缺失）。
 * 当前实现：调用 /confirm 并把目标 fileId 作为 primary_file_id传入。
 * 注意：此操作同时会把 item.status翻为 confirmed，请在前端按需处理。
 *
 *真实生产中应改为：等待后端补上 `POST /api/items/{itemId}/files/{fileId}/primary`
 * 后改为：
 * await apiClient.post(`/api/items/${itemId}/files/${fileId}/primary`);
 */
export async function setPrimaryFile(itemId: string, fileId: string): Promise<void> {
 //临时绕行：调用 confirm端点。后端会同步设主文件并把 item.status改为 confirmed。
 await apiClient.post(`/api/items/${encodeURIComponent(itemId)}/confirm`, {
 primary_file_id: fileId,
 });
}

/**
 * 把一个未认领文件指派给某个 item。
 *
 * ⚠️ 后端未实现专用端点。当前实现：先调用 refresh 让 watcher重新扫描，
 * 然后由用户在 UI 里拖到对应子文件夹 / 由匹配规则接管。
 * （watchdog 自动归属是主路径，手动指派仅作为兜底。）
 */
export async function assignFile(itemId: string, fileId: string): Promise<void> {
 // 后端 routers/files.py 未提供直接 assign端点；触发 refresh 让 watcher重新匹配。
 //真实生产应实现：POST /api/items/{itemId}/files/{fileId}/assign
 await refreshItem(itemId);
}
