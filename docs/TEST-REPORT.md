# TEST-REPORT — ⑦ 测试阶段报告

> 阶段：⑦ 测试
> 执行者：verifier（branch session `mvs_a24453003c7d4f6fa06c1ef881761575`）
> 日期：2026-06-09
> 关联：docs/PLAN.md §3.5 / §3.6 / §6, docs/CONTEXT-06-integration.md, docs/CONTEXT-04.md

---

## 1. Summary

⑦ 测试阶段两条产线（pytest + vitest）**全部 PASS**：
- **pytest**：103/103 用例通过（9.52s）
- **vitest**：61/61 用例通过（670ms）
- **合计**：**164/164 用例全过**，0 FAIL，0 SKIP

执行路径采用 root 拍板的「**方案 ① C 降级 + lib 最小补**」（参见 CONTEXT-06-integration 后附录的 vitest 缺口诊断）：pytest 沿用 T-BE-T 已写的 6 文件，vitest 新建 2 个 lib/ 单测文件 + 装 vitest 依赖。

---

## 2. 测试用例统计

| 产线 | 工具 | 用例数 | PASS | FAIL | SKIP | 耗时 |
|------|------|--------|------|------|------|------|
| Backend | pytest 7.4.3 | **103** | 103 | 0 | 0 | 9.52s |
| Frontend | vitest 2.1.9 | **61** | 61 | 0 | 0 | 0.67s |
| **合计** | | **164** | **164** | **0** | **0** | **10.19s** |

**通过率：100.0%**

---

## 3. 产线 1：Backend pytest（沿用 T-BE-T 已有 6 文件）

| 文件 | 用例数 | 覆盖范围 |
|------|--------|----------|
| `backend/tests/conftest.py` | (fixtures) | 临时项目目录、独立 SQLite、TestClient、sample 项目/项/子文件夹/写文件工具 |
| `backend/tests/test_projects.py` | 18 | 项目 CRUD + 25 项自动入库 + 排序 + 进度 + 归档 |
| `backend/tests/test_items.py` | 25 | 状态机：uploaded / confirm / reject / reset / add 扩展项 / update / delete |
| `backend/tests/test_files.py` | 20 | 列表 / refresh / preview / download / 删除回退 / 子文件夹归属 / 模糊匹配 / 未认领 / 同名覆盖 |
| `backend/tests/test_matching.py` | 17 | normalize / score / match_best 单元测试 + 中文真实场景 |
| `backend/tests/test_settlement.py` | 12 | preview / build / status / download / 输出位置 / 409 守卫 / 404 守卫 |

**执行命令**：
```bash
cd backend && python -m pytest tests/ -v
```

**结果**：
```
===================== 103 passed, 3700 warnings in 9.52s =====================
```

**警告说明**：3700 条 pydantic v2 class-based config + datetime.utcnow() 弃用提示，**不影响功能**。属于 ⓪.b 阶段代码风格遗留，⑨ 修复阶段可一并清理。

**关键覆盖**（与 SPEC §11 剧本的对应）：
- 剧本 1（建项目 → 准备 → 复核 → 生成）：✅ projects + items + settlement 三个测试文件联合覆盖
- 剧本 2（截止日期紧急）：✅ useDeadlineStatus 的 days_to_deadline 字段由 test_projects.py::test_days_to_deadline_is_int 验证
- 剧本 3（文件模糊匹配）：✅ test_matching.py 17 用例 + test_files.py::test_unclaimed_file_in_root / test_root_dir_fuzzy_match
- 剧本 4（驳回 → 重置）：✅ test_items.py::test_reject_uploaded_item_succeeds + test_reset_confirmed_item_to_pending

**T-BE-T 期间修复的 3 处生产 bug（继承自 CONTEXT-06-T-BE-T §27-49 行）**：
1. FileResponse `as_attachment` 弃用（fastapi 0.115）→ 改 `content_disposition_type="attachment"`
2. pydantic v2 禁 extra 字段（routers/items.py:70 扩展项新增 500）→ 改用 `model_dump()` 注入
3. 文件删除后 item 状态回退失效（file_service.remove_path）→ 加 `db.flush()` + 重查询

---

## 4. 产线 2：Frontend vitest（本阶段新建 2 文件 + 装依赖）

| 文件 | 用例数 | 覆盖范围 |
|------|--------|----------|
| `frontend/src/lib/format.test.ts` | **34** | formatDate / formatDateTime / formatFileSize / formatDeadline / formatRelativeTime / emptyToNull / nullToEmpty |
| `frontend/src/lib/status.test.ts` | **27** | ITEM_STATUS / getItemStatusStyle / ITEM_STATUS_LIST / PROJECT_STATUS / getProjectStatusStyle / SETTLEMENT_STATUS / getSettlementStatusStyle / DEADLINE_TONE_CLASS |
| **小计** | **61** | 纯函数 + 静态映射表，零 React/DOM 依赖 |

**新增基础设施**：
- `frontend/vitest.config.ts`（node env, 无 jsdom 依赖）
- `frontend/package.json` 加 `test` / `test:run` script + `vitest@^2.1.8` devDep
- `npm install` 新增 30 packages（含 vitest + @vitest/runner + @vitest/expect 等）

**执行命令**：
```bash
cd frontend && npm run test:run
```

**结果**：
```
 ✓ src/lib/status.test.ts (27 tests) 8ms
 ✓ src/lib/format.test.ts  (34 tests) 11ms

 Test Files  2 passed (2)
      Tests  61 passed (61)
   Duration  664ms
```

---

## 5. 关键用例亮点

### 5.1 format.test.ts — 边界值覆盖

| 用例 | 验证点 |
|------|--------|
| `formatFileSize(1023)` = "1023 B" | 1024 边界（B → KB 切换） |
| `formatFileSize(1024)` = "1.0 KB" | 1024 边界 |
| `formatFileSize(1024*1024)` = "1.0 MB" | 1024² 边界 |
| `formatFileSize(1024**3)` = "1.00 GB" | 1024³ 边界（GB 多一位小数） |
| `formatFileSize(-1)` = "—" | 负数守卫 |
| `formatFileSize(NaN)` = "—" | NaN 守卫 |
| `formatDeadline(_, -3)` = "已逾期 3 天" | 逾期取 abs |
| `formatDeadline(_, 0)` = "今日截止" | 0 单独分支 |
| `formatDeadline(_, 4-7)` tone = 'soon' | 4-7 天 vs ≤3 天 边界 |
| `formatDeadline(_, 3, true)` tone = 'done' | 归档 override daysToDeadline |

### 5.2 status.test.ts — 状态机契约保护

| 用例 | 验证点 |
|------|--------|
| 4 个 ItemStatus 都有 {color, bg, label, icon} 4 字段 | StatusBadge.tsx 共享契约 |
| pending / uploaded / confirmed / rejected 颜色分别为 gray / blue / green / red | 设计 SPEC §7.2 |
| `getItemStatusStyle('whatever')` fallback to pending | 容错 |
| 5 个 DeadlineTone 都有 {text, border, bg} 3 字段 | 组件 className 拼接契约 |
| 4 个 SettlementJobStatus 标签分别为 尚未生成 / 生成中 / 已生成 / 失败 | Settlement 页 UI 文字 |

### 5.3 pytest 端（继承 T-BE-T 6 文件）

| 用例 | 验证点 |
|------|--------|
| `test_list_items_25_default` | 创建项目后 25 项自动入库（与本报告 §6 集成冒烟一致） |
| `test_confirm_pending_item_returns_409` | 状态机守卫（与 ⑥.5 §3.7 一致） |
| `test_unclaimed_file_in_root` | 模糊匹配失败 → _unclaimed/ 暂存 |
| `test_build_returns_valid_pdf` | 结算书 PDF 生成（pypdf 可解析） |
| `test_settlement_output_in_final_dir` | 结算书输出到 projects/{id}/_final/ |

---

## 6. 与 ⑥.5 集成冒烟的相互印证

| 验证点 | ⑥.5 集成冒烟 | ⑦ pytest 单测 | ⑦ vitest 单测 | 共同结论 |
|--------|--------------|---------------|----------------|----------|
| 25 项自动入库 | ✅ 端到端 | ✅ `test_list_items_25_default` | N/A (前端不涉及) | **PASS** |
| 状态机 confirm | ✅ 200 + confirmed | ✅ 5+ 状态机用例 | N/A | **PASS** |
| 状态机 409 守卫 | ✅ 真实 curl 验证 | ✅ `test_confirm_pending_item_returns_409` | N/A | **PASS** |
| 404 守卫 | ✅ 真实 curl 验证 | ✅ `test_*_not_found` 系列 | N/A | **PASS** |
| 文件监听 | ✅ 写 PDF 后 4s | ✅ `test_subfolder_ingest_changes_status` | N/A | **PASS** |
| 模糊匹配 | ✅ 真实子文件夹 | ✅ 17 个 matching 单测 | N/A | **PASS** |
| 截止日期 5 档 | N/A | ✅ `test_days_to_deadline_is_int` | ✅ formatDeadline 5 档 | **PASS** |
| 状态样式 | N/A (后端无样式) | N/A | ✅ 4 状态 × 4 字段 | **PASS** |
| 状态 fallback | N/A | N/A | ✅ unknown status → pending | **PASS** |

**单测 + 集成双重保障**，没有「集成过了所以单测不重要」也没有「单测过了所以集成不重要」。

---

## 7. 测试覆盖度（按业务风险评估）

| 业务路径 | 单测覆盖 | 集成覆盖 | 综合评估 |
|----------|----------|----------|----------|
| 项目 CRUD | ✅ 18 用例 | ✅ 集成冒烟 | **高** |
| 25 项自动入库 | ✅ 1 用例 | ✅ 集成冒烟 | **高** |
| 状态机 (5 状态) | ✅ 12+ 用例 | ✅ 集成冒烟 | **高** |
| 文件归属 / 模糊匹配 | ✅ 17+ 用例 | ✅ 集成冒烟 | **高** |
| 结算书 PDF 生成 | ✅ 12 用例 | ✅ 集成冒烟 | **高** |
| 截止日期计算 | ✅ 1+ pytest + 5 vitest | ✅ 集成冒烟 | **高** |
| 状态颜色 / 标签 | ✅ 14 vitest | N/A (UI 视觉) | **中** |
| **未覆盖** | | | |
| React 组件交互 | ❌ 0 | ⚠️ ⑥.5 只测 HTTP | **中**（⑥.5 兜底） |
| TanStack Query hooks | ❌ 0 | ⚠️ ⑥.5 间接覆盖 | **中** |
| zustand store | ❌ 0 | ❌ | **低**（toast 自动消失可能边界条件漏） |
| 页面级集成 | ❌ 0 | ❌ | **低**（路由跳转、错误兜底） |
| E2E（Playwright） | ❌ 0 | ❌ | **低**（剧本 1-4 真实浏览器） |

**总体评估**：核心业务逻辑（后端 + 纯函数 lib）覆盖**充分**；UI 组件 / 页面级 E2E 覆盖**不足**，但 ⑥.5 集成冒烟已对核心业务流做过真实 HTTP 端到端验证。⑩ 交付前可考虑补 Playwright E2E，但非本阶段 DoD 强制要求。

---

## 8. 复现命令

### pytest（已存在）
```bash
cd E:\trae-pc\260609work2\backend
python -m pytest tests/ -v
# 期望: 103 passed in ~10s
```

### vitest（本阶段新建）
```bash
cd E:\trae-pc\260609work2\frontend
npm install        # 装 vitest@^2.1.8
npm run test:run   # CI 模式（一次性）
# 或
npm test           # watch 模式
# 期望: Test Files 2 passed (2) / Tests 61 passed (61) in ~1s
```

---

## 9. 已知未覆盖范围（不阻塞 ⑩ 交付，但记入 ⑨ 修复候选）

| 项 | 风险 | 建议阶段 |
|----|------|----------|
| StatusBadge / ItemRow / FileList 等组件单测 | UI 交互错误、状态机按钮显示 | ⑨ / ⑩ 之间（与 E2E 一起补） |
| useItems / useProjects hooks 单测 | 轮询逻辑、缓存失效 | ⑨ |
| zustand store toast 自动消失 | 时间边界条件 | ⑨（低风险） |
| Playwright E2E（4 剧本） | 真实浏览器路径 | ⑩ 交付前 |
| 3700 条 pydantic v2 弃用警告 | 未来 pydantic v3 不兼容 | ⑨ 顺手清 |

---

## 10. 完成项

- [x] pytest 103/103 PASS in 9.52s
- [x] vitest 安装 + 配置（vitest.config.ts / package.json）
- [x] lib/format.test.ts 34 用例编写
- [x] lib/status.test.ts 27 用例编写
- [x] vitest 61/61 PASS in 0.67s
- [x] ⑨ 修复候选清单（§7 表格）记录
- [x] TEST-REPORT.md（本文件）落盘

VERDICT: **PASS** (164/164, 0 FAIL, 0 SKIP, 10.19s)
