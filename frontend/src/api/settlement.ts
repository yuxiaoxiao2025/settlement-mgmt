/**
 * 结算书（Settlement）API 封装。
 *
 * 端点清单（与 backend/app/routers/settlement.py 对齐）：
 * - GET  /api/projects/{projectId}/settlement/preview   检查可生成性
 * - POST /api/projects/{projectId}/settlement/build      触发生成（同步执行，可能耗时）
 * - GET  /api/projects/{projectId}/settlement/status     查询最近一次任务状态
 * - GET  /api/projects/{projectId}/settlement/download   下载已生成的 PDF
 *
 * 注意（DESIGN §4.5）：
 * - 后端首次实现走同步生成（`POST /build` 会阻塞至完成），返回的 `status` 直接是 success/failed。
 * - 但前端仍按异步模型设计：POST 后轮询 `/status`，便于将来后端切到 BackgroundTasks 时无需改 UI。
 * - `/status` 在「从未生成过」时返回 `{ status: 'idle' }`（见 SettlementJobResponse 可选字段）。
 */
import apiClient from './client';
import type { SettlementPreview, SettlementJob } from '../types';

/**
 * 预览：检查项目的所有 item 是否都已 confirmed。
 *
 * 用于在结算书页打开时立即决定「生成」按钮的 enabled/disabled。
 */
export async function previewSettlement(projectId: string): Promise<SettlementPreview> {
  const { data } = await apiClient.get<SettlementPreview>(
    `/projects/${encodeURIComponent(projectId)}/settlement/preview`,
  );
  return data;
}

/**
 * 触发结算书生成。
 *
 * 后端会：
 *   1. 再做一次 readiness 检查（防御并发）
 *   2. 创建 settlement_log (status='running')
 *   3. 同步执行 settlement_builder.build_settlement()
 *   4. 返回更新后的 SettlementJob
 *
 * 失败抛出（HTTP 409/500），由调用方 catch 并 toast。
 */
export async function buildSettlement(projectId: string): Promise<SettlementJob> {
  const { data } = await apiClient.post<SettlementJob>(
    `/projects/${encodeURIComponent(projectId)}/settlement/build`,
  );
  return data;
}

/**
 * 查询最近一次生成任务的状态。
 *
 * @returns SettlementJob，其中 `status` 可能为 idle/running/success/failed。
 */
export async function getSettlementStatus(projectId: string): Promise<SettlementJob> {
  const { data } = await apiClient.get<SettlementJob>(
    `/projects/${encodeURIComponent(projectId)}/settlement/status`,
  );
  return data;
}

/**
 * 下载结算书的相对 URL（走 Vite 代理 /api → :18000 / docker nginx :18000 反代 → backend:18000）。
 *
 * 浏览器原生 <a> / window.open 即可触发流式下载，不在内存里加载整个 PDF。
 * 注意：相对路径（不带 /api 前缀），因为目标在 apiClient baseURL 之下；
 * 但 <a> 直接访问不走 axios，所以仍要拼上 /api 前缀给浏览器用。
 */
export function downloadSettlementUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/settlement/download`;
}

/**
 * 预览结算书 PDF 的相对 URL（inline 头，浏览器内嵌显示）。
 *
 * 与 download 不同：后端返回 Content-Disposition: inline，浏览器用 pdf.js / <iframe> 直接渲染。
 */
export function previewSettlementUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/settlement/preview-pdf`;
}

/**
 * 触发浏览器下载结算书（在 Settlement 页用「下载」按钮时）。
 *
 * 用隐藏的 <a download> 元素绕过 popup blocker。
 */
export function downloadSettlement(projectId: string, filename?: string): void {
  const a = document.createElement('a');
  a.href = downloadSettlementUrl(projectId);
  if (filename) a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}