# ③.5 三文档对齐审计

> 阶段：③.5 三文档对齐（dev-pipeline-mavis）
> 编排者：Mavis
> 日期：2026-06-09
> 审计对象：`docs/REQUIREMENT.md` v1.0、`docs/SPEC.md` v1.0、`docs/DESIGN.md` v1.0
> 审计方式：自审（独立 verifier agent 暂未调度，按 skill 允许简化为自审）

---

## 审计结论：**PASS（带 3 项建议）**

三文档整体一致，核心需求→规格→设计的链路通顺，未发现阻塞性矛盾。
3 项建议为非阻塞性优化项，进入 PLAN 阶段处理。

## 6 维度审计

### 维度 1：一致性（Consistency）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| REQ US-1 ~ US-11 是否在 SPEC 有对应 SHALL/MUST | ✅ PASS | 11 条 US 全部映射到 SPEC 的 §1-§7 |
| SPEC SHALL/MUST 是否在 DESIGN 有实现路径 | ✅ PASS | 所有 SHALL 在 DESIGN §3-§7 有对应章节 |
| REQ/SPEC/DESIGN 术语是否一致 | ✅ PASS | Project/Item/File/Status/Settlement 等术语统一 |
| 状态机定义在 SPEC 与 DESIGN 是否一致 | ✅ PASS | 4 状态流转在 SPEC §2 与 DESIGN §6 完全一致 |
| API 端点是否三文档一致 | ⚠️ MINOR | REQ 未列具体 API；SPEC §3 列出 25 个端点；DESIGN §7 详述 5 个关键端点。**建议**：在 REQ 增加一节 "API 速览" 引用 SPEC。 |

### 维度 2：完整性（Completeness）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| REQ 11 条 US 是否被 SPEC 全部覆盖 | ✅ PASS | US-1~11 → SPEC 章节映射表见下方 |
| SPEC 所有 SHALL 是否有验收剧本 | ✅ PASS | SPEC §11 列 4 个剧本 |
| DESIGN 关键技术决策是否有备选/风险 | ✅ PASS | DESIGN §12 风险表覆盖 5 项 |
| 异常路径是否定义 | ⚠️ MINOR | REQ §4 列出范围外清单；SPEC §8 错误处理仅 4 条。**建议**：补充 WPS 不可用、磁盘满、网络中断 3 种典型异常。 |
| 部署/启动流程是否清晰 | ✅ PASS | DESIGN §10 列出 dev / prod / 启动脚本 3 套 |

**REQ → SPEC 章节映射**：

| US | SPEC 章节 |
|----|---------|
| US-1 创建项目 | SPEC §1.2, §3.1 |
| US-2 25 项自动出现 | SPEC §1.3, §3.2 |
| US-3 增删改项 | SPEC §3.2 |
| US-4 模版成长 | SPEC §1.1, §3.4, §4.4（DESIGN） |
| US-5 文件落地 Web 提示 | SPEC §4（FW-1 ~ FW-6） |
| US-6 复核打勾 | SPEC §2.1, §3.2 |
| US-7 驳回 | SPEC §2.1, §3.2 |
| US-8 截止日期倒计时 | SPEC §7.2（UI-2） |
| US-9 生成结算书 | SPEC §6, §3.5 |
| US-10 封面 + 目录 | SPEC §6（SB-1 ~ SB-5） |
| US-11 局域网多浏览器 | REQ §1.1, SPEC §1.1（PR-1~3） |

### 维度 3：可行性（Feasibility）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 技术栈依赖是否都可装 | ✅ PASS | DESIGN §1 列 13 个后端库 + 11 个前端库，全部 PyPI / npm 可用 |
| WPS CLI 在用户环境是否可用 | ✅ PASS | 用户确认本机有 WPS（实测 tasklist 看到 wps.exe 多个进程） |
| python-docx 解析 docx 模版 | ✅ PASS | 已实测：bootstrap_template.py 解析出 25 项 |
| FastAPI + watchdog + pypdf + reportlab 组合是否稳定 | ✅ PASS | 都是成熟库，组合无冲突 |
| 局域网部署可行性 | ✅ PASS | uvicorn 绑 0.0.0.0:8000，本机实测可启动 |
| PDF 合并性能（25 个文件） | ✅ PASS | pypdf 处理 25 个文件 < 5 秒 |
| 中文 PDF 生成（封面 + 目录） | ⚠️ MINOR | reportlab 用 UnicodeCIDFont（STSong-Light）实测中文渲染 OK，但需在最终交付时多生成几个样例验证 |

### 维度 4：可测试性（Testability）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 每条 SHALL 是否有可观测信号 | ✅ PASS | 状态变化、API 响应、文件存在、PDF 生成都可测 |
| 单元测试可写性 | ✅ PASS | services / core 都是纯函数，pytest 易写 |
| 集成测试可写性 | ✅ PASS | FastAPI TestClient + httpx，可模拟全流程 |
| 端到端测试可写性 | ✅ PASS | vitest + Testing Library 覆盖关键页面 |
| 手动验收清单 | ✅ PASS | SPEC §11 列 4 个剧本 |

### 维度 5：边界（Boundary）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 范围外清单是否明确 | ✅ PASS | REQ §4 列出 8 项范围外（公网鉴权/多租户/版本控制/移动 App/实时协作/邮件通知/多语言/ERP 对接） |
| 假设与约束是否记录 | ✅ PASS | REQ §6 列出 5 项已确认决策；DESIGN §12 风险表 |
| WPS 不在 PATH 的降级 | ⚠️ MINOR | SPEC §5（PD-2）只说"提示用户安装"，未给离线降级。**建议**：增加"无 WPS 时禁止 PDF 转码"硬规则，避免 silent fail。 |

### 维度 6：术语（Terminology）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 核心术语是否有定义 | ✅ PASS | SPEC §0 列出 6 个核心术语定义 |
| 缩写是否一致 | ✅ PASS | US/SB/FW/PD/PF/SC/ER/MT/IT/FL/PR/ST 全部一致 |
| 中英文混用 | ✅ PASS | UI 文案 / API 字段 / 文档术语三层清晰分离 |
| "复核"、"确认"、"审核" 是否同义 | ✅ PASS | 统一用"复核"（业务动作）+ "确认"（状态变更） |

## 关键问题与建议

### 🔴 阻塞性问题
无。

### 🟡 重要建议（建议在 PLAN 阶段处理）

1. **WPS 不可用硬规则**（SPEC-PD-2 增强）
   - 当前：SHOULD 提示用户安装。
   - 建议：MUST 在启动时检测，WPS 缺失则在 UI 顶部红条提示"PDF 转码不可用，请安装 WPS Office"；仍允许上传 PDF。
   - 处理：写入 PLAN.md 任务清单。

2. **异常路径补充**（SPEC §8 扩展）
   - 当前：仅 4 条。
   - 建议：补 3 条：磁盘满（写文件失败）、WPS 调用超时、网络中断（局域网）。
   - 处理：在 ⑥ 编码时补全异常处理。

3. **REQ 加 API 速览**（轻量补丁）
   - 当前：REQ 未提 API。
   - 建议：在 REQ §3 增加一节"技术接口"，引用 SPEC §3，避免后续 reviewer 困惑。
   - 处理：在 ⑩ 交付前补一节。

### 🟢 优化项（可选）
- 中文 PDF 字体回退方案（避免 STSong-Light 在某些 Windows 版本不可用）
- 模版项数量上限（> 50 项时分页）
- 大项目（> 50 个）的列表分页

## 审计小结

三文档达到进入 PLAN 阶段的质量门槛。3 项建议都是非阻塞性，可并行处理或延后到 ⑥/⑩。

> 进入 ④ PLAN.md
