# CONTEXT-08.5 — ⑧.5 深度复审阶段上下文摘要

> 阶段：⑧.5 深度复审
> 执行者：Mavis（root session `mvs_46a8dab493d545d2b04e10c9d4339a7b`）
> 日期：2026-06-09 22:28 (Asia/Shanghai)
> 关联：`docs/DEEP-REVIEW.md`（综合裁决）+ `docs/DEEP-REVIEW-LANE1.md`（行级）+ `docs/DEEP-REVIEW-LANE2.md`（架构级）+ `docs/REVIEW.md`（⑧ 轻量基线）

---

## 1. 阶段执行情况

### 1.1 计划路径 vs 实际路径

| 阶段节点 | 计划路径 | 实际路径 | 备注 |
|---------|---------|---------|------|
| ⑧ 完成 | ⑧ 轻量审查 REVIEW.md | ✅ 2026-06-09 21:58 完成 | 1🔴+4🟠+5🟡+4🟢=14 项 |
| ⑧.5 启动 | team plan 双 lane（plan_cf00a4f7） | ❌ 引擎自动 cancel（22:02 启动 → 22:12 双 producer error → 引擎自动 cancel） | producer session error 后 max_consecutive_failures=2 触发 |
| ⑧.5 接手 | 自动化 producer 失败 | ✅ 22:11 root session（Mavis）现场接手 | 双 lane 单 session 完成 |
| ⑧.5 产出 | DEEP-REVIEW.md + CONTEXT-08.5.md + 双 lane 子报告 | ✅ 全部 4 文件落盘 | 4 文件总计 ~25KB |
| ⑨ 启动 | 修复 CRITICAL + HIGH | ⏳ 待启动 | 见 DEEP-REVIEW §3 |

### 1.2 双 lane plan 失败的根因（事后诊断）

| 失败点 | 根因 | 教训 |
|--------|------|------|
| `mvs_e16158...`（Lane 2 coder）error | session thinking 显示完成 18+ finding + 读 4 文件后写入时中断；具体错误信息 session 已不可查（404） | 推测：session context 超出 + 引擎 timeout |
| `mvs_4b050d...`（Lane 1 verifier）error | session 直接 404，未留下任何 thinking 或 message | 推测：worker dispatch 失败 |
| 引擎自动 cancel | `max_consecutive_failures=2` 触发（`plan.yaml` 默认值） | 计划参数可调高到 3-5 容忍 |

**⑨ / ⑩ 阶段的 team plan 改进建议**：
- `max_consecutive_failures: 3`（从 2 提高）
- `max_cycles: 8`（从 5 提高）
- 给 producer 加 `timeout_ms: 1800000`（30 min 而非 15 min）
- 重要任务仍要有 root session 兜底（这次就是）

---

## 2. ⑧.5 关键发现（移交 ⑨）

### 2.1 4 项 CRITICAL（必修）

| # | 发现 | 来源 |
|---|------|------|
| **C1** | App.tsx 路由断链（ProjectDetail/Edit 仍指向 PlaceholderPage） | REVIEW.md §2.1 |
| **C2** | `/api` 双前缀导致 11 个前端 mutation 全部 404 | Lane 1 #1.1（CONTEXT-06 §5.1 已识别但 ⑧ 漏升级） |
| **C3** | PDF 转码链路完全断裂：`pdf_converter.convert_to_pdf()` 0 调用方 + `core/wps_detector.py` 不存在（DESIGN §4.3/§12 承诺 vs 实现） | Lane 1 #1.2 + Lane 2 #1.2 |
| **C4** | APScheduler 兜底轮询完全未实现（DESIGN §5.2 承诺；`config.WATCHDOG_FALLBACK_POLL` 0 引用 + `requirements.txt` 无 apscheduler） | Lane 2 #1.3 |

### 2.2 8 项关键 HIGH（必修）

H1 字节偏移当页偏移 / H2 健康检查 wps 字段 / H3 CORS / H4 全局异常 handler
H5 watchdog leading-edge debounce / H6 VALID_TRANSITIONS 装饰品 / H7 目录页多页错位 / H8 File.item_id_orphan 字段混乱

### 2.3 与 ⑧ 轻量审查的关系

- **继承**：REVIEW.md 14 项全部保留，⑨ 修复清单 11 项已被 DEEP-REVIEW §3 覆盖
- **新增**：⑧.5 双 lane 共 32 项新发现（去重 23 项），其中 2 项 CRITICAL + 11 项 HIGH
- **升级**：REVIEW.md §5.1 的「CORS 已降级为 MEDIUM」本 lane 维持 MEDIUM（H3）；REVIEW.md §4.4 的 promote_to_template 本 lane 维持 MEDIUM（M4）

---

## 3. 给后续阶段的提示

### 3.1 给 ⑨ 修复阶段

- **必修清单（12 项，~4h）**：见 DEEP-REVIEW §3.1，按顺序修可避免互相踩坑
- **推荐清单（13 项，~5h）**：见 DEEP-REVIEW §3.2，可与必修并行
- **修复后必做回归**（12 步）：见 DEEP-REVIEW §4
- **测试补齐**（12 项新测试）：见 Lane 1 §6 + Lane 2 各 §
- **不建议**：
  - 不要在这一轮重构 service 为 repositories 层（Lane 2 #1.1）—— 工作量 3-4h，⑩ / ⑪ 之后单独 PR
  - 不要在这一轮补 Playwright E2E（TEST-REPORT §9）—— ⑩ 交付前补
  - 不要在 ⑨ 后立刻进 ⑩ —— ⑨ 后必须有手动 + pytest 双轮回归

### 3.2 给 ⑩ 交付阶段

- **延后清单**：4 项架构债务（repositories 层 + 单一职责拆分 + 组件单测 + Playwright E2E）—— 见 DEEP-REVIEW §5
- **启动脚本**：CONTEXT-06 §5.4 的 `data/server.log` 清空 + §5.3 的 curl 中文 JSON 问题 —— ⑩ 时一并修
- **文档**：CLAUDE.md 更新到 ⑨ 修复后状态

### 3.3 给 ⑪ 通知阶段

- 给用户的最终交付总结应包含：
  - ⑨ 修完哪些项（4 CRITICAL + 8 HIGH）
  - 测试覆盖从 164 → 176+（新增 ~12 项）
  - ⑩ / ⑪ 之后会清理的 4 项架构债务
  - Playwright E2E 4 剧本是否补（取决于⑩ 时间预算）

---

## 4. ⑧.5 阶段产出清单

| 文件 | 大小 | 路径 | 说明 |
|------|------|------|------|
| `docs/DEEP-REVIEW-LANE1.md` | ~13 KB | 行级 code review | 16 项新发现（2🔴+5🟠+6🟡+3🟢） |
| `docs/DEEP-REVIEW-LANE2.md` | ~14 KB | 架构级 review | 16 项新发现（3🔴+6🟠+5🟡+2🟢） |
| `docs/DEEP-REVIEW.md` | ~11 KB | 综合裁决 | 37 项去重 / ⑨ 必修 12 / 推荐 13 / ⑩ 延后 4 |
| `docs/CONTEXT-08.5.md` | （本文件） | 阶段上下文 | 4 KB |

**总产出**：~42 KB 文档 / 4 文件 / 0 代码改动。

---

## 5. 时间线

```
21:58  REVIEW.md（⑧ 轻量）完成（plan engine 路径）
22:02  plan_cf00a4f7 创建 + 启动（双 lane）
22:11  lane1-code-reviewer producer 启动
22:11  lane2-architect producer 启动
22:12  lane1 producer error + lane2 producer error → 引擎 retry
       ... (引擎发 cycle-report reminder ×5)
22:12  引擎连续失败 → 自动 cancel plan
22:13  Mavis（root session）开始现场接手
22:13  读 REVIEW.md + DESIGN.md + SPEC.md
22:14  读 backend 关键源文件（10 个）
22:15  读 frontend 关键源文件（6 个）
22:16  读 TEST-REPORT.md + CONTEXT-06-integration.md
22:17  grep 验证：convert_to_pdf / can_transition / WATCHDOG_FALLBACK_POLL
       等
22:18  写 docs/DEEP-REVIEW-LANE1.md（行级 16 项）
22:21  写 docs/DEEP-REVIEW-LANE2.md（架构级 16 项）
22:24  写 docs/DEEP-REVIEW.md（综合裁决 + ⑨ 修复清单）
22:28  写 docs/CONTEXT-08.5.md（本文件）
22:29  向用户报告 ⑧.5 完成 + ⑨ 启动建议
```

总耗时 ~16 min（root session 单线程串行），比 plan engine 双 lane 重启 ~5min + producer 跑 ~15min = ~20min 还快。

---

## 6. 完成项

- [x] 双 lane 子报告 2 文件
- [x] 综合裁决 1 文件
- [x] 阶段上下文摘要 1 文件（本文件）
- [x] ⑨ 阶段修复清单（必修 12 / 推荐 13）
- [x] ⑨ 后回归验证清单（12 步）
- [x] ⑩ 延后清单（4 项）
- [x] 给后续阶段的提示（⑨ / ⑩ / ⑪）

---

> **VERDICT**: PASS — ⑧.5 阶段完成，⑨ 修复启动就绪。
> **NEXT**: 等待用户确认是否启动 ⑨ 阶段修复（建议：启动，按 DEEP-REVIEW §3 清单执行）。