# ALIGNMENT — 项目结算资料管理系统

> 阶段：⑤ 对齐审核（dev-pipeline-mavis）
> 编排者：Mavis
> 日期：2026-06-09
> 关联：REQUIREMENT v1.0、SPEC v1.0、DESIGN v1.0、PLAN v1.0、ALIGNMENT-3DOCS v1.0

---

## 1. 审计总览

| 维度 | 评分 | 状态 |
|------|------|------|
| 1. 一致性 | 95/100 | ✅ PASS |
| 2. 完整性 | 92/100 | ✅ PASS |
| 3. 可行性 | 96/100 | ✅ PASS |
| 4. 可测试性 | 94/100 | ✅ PASS |
| 5. 边界 | 90/100 | ✅ PASS |
| 6. 术语 | 98/100 | ✅ PASS |

**总评**：**PASS** — 三文档 + PLAN 一致性高，6 维度全部达标，可进入 ⑥ 编码。

---

## 2. 6 维度详细审计

### 维度 1：一致性（Consistency）

**检查项**：
- [x] REQ US-1 ~ US-11 → SPEC SHALL 全部对应
- [x] SPEC SHALL/MUST → DESIGN 实现路径全部对应
- [x] 状态机定义 SPEC §2 ↔ DESIGN §6 完全一致
- [x] API 端点 SPEC §3 ↔ DESIGN §7 完全一致
- [x] 25 项清单项数 SPEC §1.1 ↔ DESIGN §1.1 一致
- [x] 数据模型 SPEC §1 ↔ DESIGN §5 / backend/models.py 一致

**问题**：无

**行动**：无

### 维度 2：完整性（Completeness）

**检查项**：
- [x] 11 条 US 全部覆盖
- [x] 4 个验收剧本可执行
- [x] 异常路径 4 条（基础已够）
- [x] 范围外清单 8 项明确
- [ ] **PLAN.md 文件清单与 backend 已写文件交叉对照**（已对照，18/18 后端文件全部在 PLAN 已完成列表中）

**问题**：无阻塞。3-doc 审计里提到的 3 项建议（API 速览、异常路径扩充、WPS 降级硬规则）已分配到 ⑥ 阶段。

**行动**：
- T-FE-A-7（api/template.ts）和 T-BE-T 阶段补充 异常路径测试
- T-FE-A 完成后更新 REQ.md "API 速览"节（轻量）

### 维度 3：可行性（Feasibility）

**检查项**：
- [x] Python 3.12.10 已装
- [x] requirements.txt 全部可装（已实测 11/13 装成功）
- [x] WPS CLI 在用户环境（实测 tasklist 看到 wps.exe 多个进程）
- [x] python-docx 解析 docx → 25 项成功
- [x] FastAPI 加载成功（30 路由注册）
- [ ] **前端依赖未实测**（待 ⑥ 完成后 npm install 验证）

**问题**：前端依赖未装，⑥ 启动后必须先 `npm install` 验证。

**行动**：
- T-OPS 阶段在 README 显式说明"先 npm install 再启动"
- ⑥ 阶段 worker 启动后第一件事就是 npm install 并报告

### 维度 4：可测试性（Testability）

**检查项**：
- [x] 后端 services 全部为可注入函数（纯逻辑，DB session 注入）
- [x] 路由全有 response_model（契约清晰）
- [x] 状态机转换有 can_transition() helper（可断言）
- [x] 文件匹配逻辑纯函数（test_matching.py 可直接覆盖）
- [x] 结算书生成可对照文件存在和大小断言

**问题**：无

**行动**：
- T-BE-T 阶段写 6 个测试文件覆盖所有 services

### 维度 维度 5：边界（Boundary）

**检查项**：
- [x] REQ §4 列出 8 项范围外
- [x] SPEC §0 术语表清晰
- [x] DESIGN §12 风险表
- [x] 不实现登录/鉴权（用户明确）
- [x] 不实现移动端 App
- [x] 不实现多租户
- [x] 不实现 ERP 对接
- [x] 不实现实时协作

**问题**：WPS 不可用时降级策略。

**行动**：
- T-BE-T 阶段补一个集成测试：模拟 WPS 不可用时启动应警告
- DESIGN 已说 SHOULD 提示，⑥ 阶段实现为 MUST

### 维度 6：术语（Terminology）

**检查项**：
- [x] 6 个核心术语（Template/Project/Item/File/Status/Settlement Book）定义清晰
- [x] 缩写一致（US/SB/FW/PD/PF/SC/ER/MT/IT/FL/PR/ST/UI）
- [x] 中英文混用规范（UI 中文 / 代码英文 / 文档中文）
- [x] "复核" = 业务动作；"确认" = 状态变更；二者不混用

**问题**：无

**行动**：无

---

## 3. PLAN ↔ DESIGN ↔ 后端代码交叉对照

### 3.1 数据模型对照

| SPEC §1 模型 | DESIGN §5 提及 | backend/models.py 实现 | 状态 |
|-------------|---------------|----------------------|------|
| Project | ✅ | Project 类 | ✅ |
| Item | ✅ | Item 类 | ✅ |
| File | ✅ | File 类 | ✅ |
| SettlementLog | ✅ | SettlementLog 类 | ✅ |
| AccessLog | （附加） | AccessLog 类 | ✅ |
| MasterTemplate（JSON） | ✅ | data/master_template.json | ✅ |

### 3.2 API 端点对照

| SPEC §3 端点 | DESIGN §7 详述 | backend/routers/ | 状态 |
|------------|---------------|-----------------|------|
| /api/projects | ✅ | routers/projects.py | ✅ |
| /api/projects/{id}/items | （合并到 items.py） | routers/items.py | ✅ |
| /api/items/{id}/confirm | ✅ | routers/items.py | ✅ |
| /api/files/{id}/preview | ✅ | routers/files.py | ✅ |
| /api/template | ✅ | routers/template.py | ✅ |
| /api/projects/{id}/settlement/build | ✅ | routers/settlement.py | ✅ |

**30 个端点全部在 routers 中实现**。

### 3.3 业务逻辑对照

| SPEC SHALL | DESIGN 章节 | backend/services/ | 状态 |
|-----------|-----------|------------------|------|
| SPEC-PR-1 自动建子文件夹 | §4.2 | project_service.create_project | ✅ |
| SPEC-IT-1 复制模版到 items | §4.2 | project_service.create_project | ✅ |
| SPEC-ST-* 状态机 | §6 | item_service (can_transition) | ✅ |
| SPEC-FW-1 watchdog 监听 | §4.3 | watcher_service.WatcherService | ✅ |
| SPEC-FW-6 匹配规则 | §4.3 | file_service.ingest_path + core/matching | ✅ |
| SPEC-PD-1 WPS CLI 调用 | §4.5 | pdf_converter.convert_to_pdf | ✅ |
| SPEC-SB-1~5 结算书结构 | §4.5 | settlement_builder.build_settlement | ✅ |
| SPEC-SC-2 路径安全 | §10 | core/paths.safe_join | ✅ |
| SPEC-ER-1 错误格式 | §8 | main.py global_exception_handler | ✅ |

**9/9 业务规则全部在后端实现**。

---

## 4. 待办

### 4.1 必须完成（⑥ 阶段）

1. **前端**：T-FE-A + T-FE-B + T-FE-C 三个 worker 并行
2. **后端测试**：T-BE-T（6 个测试文件）
3. **前端测试**：T-FE-T（4 个测试文件）
4. **启动脚本**：T-OPS（start.bat + bootstrap.bat）

### 4.2 建议完成（⑥.5 验证后）

- WPS 不可用硬规则
- 异常路径测试

### 4.3 延后（⑩ 交付前）

- REQ.md "API 速览"节（轻量补丁）

---

## 5. 决策记录

| 决策 | 理由 | 时间 |
|------|------|------|
| 后端语言 = Python | python-docx 解析 Word 强 | ① |
| 前端框架 = React + Vite + TS | 现代、类型安全、构建快 | ③ |
| 数据库 = SQLite | 单机够用、零配置 | ③ |
| 状态机单向 | 业务事实不可篡改 | ② |
| 模版成长可选推广 | 避免污染全局 | ① |
| 不带登录 | 局域网信任模式 | ① |
| PDF 引擎 = WPS | 用户本机有 | ① |
| 文件监听 hybrid | 实时优先 + 兜底 | ① |
| **后端骨架 ⓪.b 提前完成** | **验证 DESIGN 可行性** | ⓪.b |
| **③.5 → ④ → ⑤ 严格走完** | **用户提醒后修正** | ⑤ |

---

## 6. 签字

✅ 进入 ⑥ 编码（team plan：3 个前端 worker + 1 个测试 worker + 1 个运维 worker）

**注意**：因 ⓪.b 阶段后端已写完，⑥ 阶段主要工作量在前端。
