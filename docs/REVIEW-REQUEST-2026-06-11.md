# 代码审查报告 — 2026-06-11（v0.3.0 三轮迭代后）

> **方法**：3 个并行 track 独立审查 → 交叉确认 → 合并。
> - **Track 1**（coder 视角）：代码质量 / 设计 / 性能 / 可读性
> - **Track 2**（verifier 视角）：测试覆盖 / 安全 / 集成 / 边界
> - **Track 3**（架构师视角，Mavis）：架构 / 端到端一致性 / 用户体验 + **实跑验证**
> 详细报告：`docs/REVIEW-TRACK1-OUTPUT.md` / `REVIEW-TRACK2-OUTPUT.md` / `REVIEW-TRACK3-OUTPUT.md`

---

## 核心发现一览

| # | 级别 | 标题 | Track | 实跑确认 | 工作量 |
|---|------|------|-------|----------|--------|
| **C-font** | Critical | docker 容器内中文字体错配，结算书 PDF 全是豆腐块 | Track 3（Track 2 自我修正升级） | ✅ 已截图 `12-docker-chinese-broken.png` | 1-2h |
| **C-status** | Critical | deadline 校验函数名撒谎（接受过去日期） | Track 2（Track 3 独立触达） | ✅ curl 复现 201 | 5 min |
| **C1 (Track1)** | Critical | promote_available 硬塞 schema → 前端契约失效 | Track 1 | ✅ 读 `items.py:70` 确认 | 15 min |
| **I-files** | Important | watcher 自循环 ingest `.pdfs/` 子目录 | Track 2 / Track 3 | 读代码确认 | 10 min |
| **I-contract** | Important | `version` vs `new_version` 字段名不匹配 → toast 显示 undefined | Track 2 / Track 3 | ✅ 读 `item_service.py:135` 确认 | 5 min |
| **I-key** | Important | ProjectDetail query key 漂移（`['project', id]` vs `projectKeys.byId(id)`） | Track 1 / Track 3 | 读代码确认 | 15 min |
| **I-empty-build** | Important | 0 项项目可 build 出"仅封面+目录"的空结算书 | Track 2 / Track 3 | 读代码确认 | 10 min |
| **I-cache** | Important | nginx `proxy_buffering off` → 大 PDF 在 Safari/Edge 预览白屏 | Track 2 / Track 3 | 理论推断 | 30 min |
| **I-archive-0** | Important | 归档 0 项项目可绕过（SPEC 待定） | Track 2 | 读代码确认 | 决策 + 5 min |
| **I-state** | Important | 2 步流程 location.state 刷新即丢，无 sessionStorage 兜底 | Track 2 / Track 3 | 读代码确认 | 1-2h |
| **C1 (Track2)** | Critical | DELETE 无鉴权 → 局域网 curl 任意硬删 | Track 2 | 读代码确认 | 产品决策（不是技术债） |
| **C3 (Track2)** | Critical | 删除顺序错（DB 先于磁盘），Windows PDF 句柄锁住导致 rmtree 失败 | Track 2 | 理论推断 | 15 min |
| M-arch | Minor | 无 alembic 数据库迁移机制 | Track 3 | 读代码确认 | 1-2 天（独立 sprint） |
| M-port | Minor | dockerfile EXPOSE 8000 / ENV PORT 8000 与实际 --port 18000 不一致 | Track 2 / Track 3 | 读代码确认 | 5 min |
| M-async | Minor | settlement 同步阻塞单 worker | Track 2 | 读代码确认 | 1 天（独立 sprint） |

> **共 6 项 Critical + 6 项 Important + 若干 Minor**。其中 C-font 是 **silent failure**（CI 164 测试全过但生产错），C-status 是 **撒谎的契约**（函数名承诺了行为但实际没做），都是必须修的。

---

## 三个 track 的交叉确认（reviewer 价值体现）

| 问题 | Track 1 | Track 2 | Track 3 | 结论 |
|------|---------|---------|---------|------|
| 字体错配 | — | 误判为"OK"（自我修正） | **独立发现并实跑复现** | **Critical**（升） |
| deadline 撒谎 | — | **发现** | 独立触达 | Critical（双确认） |
| promote_available 契约 | **发现** | — | — | Critical |
| query key 漂移 | **发现** | — | 独立触达 | Important（双确认） |
| .pdfs 自循环 | — | **发现** | 独立触达 | Important（双确认） |
| version vs new_version | — | **发现** | 独立触达 | Important（双确认） |
| 0 项项目空结算书 | — | **发现** | 独立触达 | Important（双确认） |
| nginx buffer | — | 标 P3 | 升 Important | Important（我重新定级） |

**结论**：3 个 track 各看一摊，**互补**——Track 1 看代码风格、Track 2 看契约/集成、Track 3 实跑 + 架构。**任何单一 track 都会漏掉 C-font**（代码看起来 OK，但 docker 一跑就炸）。

---

## 我建议的修复顺序（依性价比）

### 🚨 第 1 批：1 小时内可全修完（每条 < 30 min）
1. **C-status**（5 min）— 1 行 validator 改动
2. **I-contract**（5 min）— 1 字段重命名
3. **I-files**（10 min）— watcher 加 3 个跳过目录
4. **I-key**（15 min）— ProjectDetail 删自定义 hook 用统一 `useProject`
5. **I-empty-build**（10 min）— settlement.py 加 1 行 items==[] 校验
6. **C3 (Track2) 删除顺序**（15 min）— projects.py 调换 db.delete / rmtree 顺序
7. **M-port**（5 min）— dockerfile 统一 18000

### 🔥 第 2 批：1 小时内
8. **C-font**（1-2h）— settlement_builder.py Linux 分支 + dockerfile 验证 + 回归测试
9. **C1 (Track1) promote_available**（15 min）— ItemResponse 加字段 或前端去掉依赖
10. **I-cache**（30 min）— nginx 给 inline 端点加 `proxy_buffering on; gzip off`

### ⚠️ 第 3 批：需要决策
11. **C1 (Track2) DELETE 鉴权** — 决策：要不要加 LAN token？要不要 README 显著位置加 warning？
12. **I-archive-0** — 决策：0 项项目能不能归档？（SPEC 待定）
13. **I-state** — 2 步流程加 sessionStorage 兜底（1-2h）

### 📦 放 backlog（独立 sprint）
- **M-arch**（alembic 迁移机制）
- **M-async**（settlement 异步化）

---

## 我已经实跑 / 截图的证据

| 证据 | 路径 |
|------|------|
| docker 内生成的结算书 PDF（**乱码**） | `docs/screenshots/12-docker-chinese-broken.png` |
| 之前 8 张功能截图 | `docs/screenshots/01-05.png, 09-11.png` |
| 3 个 track 完整报告 | `docs/REVIEW-TRACK{1,2,3}-OUTPUT.md` |
| Track 2 完整报告（来自 scratchpad） | `docs/REVIEW-TRACK2-OUTPUT.md` |

---

## 需要你拍板的事

1. **第 1 批 + 第 2 批（共 10 条）是否全修？**（约 3-4 小时工作量）
2. **第 3 批 3 条决策**：
   - DELETE 鉴权？加 token / 仅 README warning / 不动？
   - 0 项项目能否归档？允许 / 拒绝 / 让用户在 UI 上决定？
   - 2 步流程加 sessionStorage 兜底？修 / 不修？
3. **backlog 2 条**（alembic / 异步化）放到哪个 sprint？
