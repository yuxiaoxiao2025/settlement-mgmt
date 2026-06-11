# Track1报告 — 代码质量与设计（HEAD=c19c536）

##优点

- **配置集中在 Settings**：backend/app/config.py 用 pydantic-settings统一读 `.env`/环境变量，启动时主动建 `DATA_DIR`/`PROJECTS_DIR`，未硬编码路径。 `docker-compose.yml` 也走 ENV覆盖，没有重复 magic。
- **状态机定义清晰**：`backend/app/services/item_service.py:14-19` 的 `VALID_TRANSITIONS` 把 item 的合法迁移列得很清楚；状态字段在 DB 是字符串（`pending/uploaded/confirmed/rejected`），前后端 type alias 对齐（`frontend/src/types/index.ts:16` 与 `lib/status.ts`）。
- **轮询 + invalidate 模型统一**：`frontend/src/hooks/useItems.ts` 用 query key factory（`itemKeys.byProject`）+3 秒 `refetchInterval`，每个 mutation完成后 `invalidateQueries`，无 stale state风险。
- **测试基础设施良好**：`backend/tests/conftest.py` 用 `monkeypatch`替换 `engine/SessionLocal/PROJECTS_DIR`，每个测试全新 `tmp_path`，不会污染真实数据。
- **WPS + watchdog 双轨降级**：startup 时探测 WPS，watchdog不可用时 APScheduler兜底轮询（`backend/app/services/watcher_service.py:130-153`），都设计成 no-fail优雅降级。

## Critical（必须修）

- **C1: `routers/items.py:70` 用 `resp["promote_available"] = promote_available` 把字段硬塞进 Pydantic model dump**。Pydantic v2 在 dump之后写额外 key没问题，但 router 的 `response_model=ItemResponse`模式下 FastAPI 会再 dump一次丢弃非 schema字段——前端永远拿不到 `promote_available`，等于死代码。`api/items.ts:32-39` 的 `AddItemResponse extends Item` 是基于「这个字段能拿到」设计的，现在成空头支票。
修复：要么把这个字段升级到 Pydantic schema（`ItemResponse` 加 `promote_available: bool = False`），要么前端不再依赖这个值。优先级 P1（影响前端 promote提示功能，但有兜底 UX，目前是默默失效）。

- **C2: `services/file_service.py:99-104` unclaimed 文件的转码 dst目录硬塞 `_unclaimed` 这个 item_name**——但 `_try_convert_to_pdf`内部用 `_safe_name("_unclaimed")` 生成路径，再调 `convert_to_pdf(src, dst_dir)`。`pdf_converter.py:44` 用 `src.stem + ".pdf"`命名输出，导致两个不同 unclaimed 文件的 PDF互相覆盖（`A.pdf` 转码后叫 `A.pdf`，`B.pdf` 转码后叫 `B.pdf`没问题；但如果同名非 PDF 如 `扫描件.docx`出现在两个 unclaimed 行会覆盖）。更深层的问题：`unclaimed`行的 PDF路径没有存到 File.pdf_path 是因为 `_try_convert_to_pdf` 返回的路径没绑定回 `f.pdf_path`——看代码确实有写 `if pdf_path: f.pdf_path = pdf_path`，所以实际不会丢，只是同名 docx 会覆盖。优先级 P2（功能正确，但 unclaimed 多份同名 docx 时预览会显示错误文件）。

- **C3: `services/settlement_builder.py:25` 在 module import阶段调用 `sys.platform.startswith("win")`，但 `import sys` 被放在第59 行（`# noqa: E402`）**。Python允许这样，但 **第25 行已经引用了 `sys`**——这是个 lint假象，运行没问题，但是任何人 copy-paste 这个 `_register_cn_fonts()` 函数都会触发 NameError。更稳的做法是把 `import sys`放在文件顶部，或者把函数改成参数化（接受 platform字符串）。优先级 P2（运行 OK，重构风险）。

## Important（建议修）

- **I1: `routers/items.py:45-50` unclaimed过滤用 `u.original_path.replace("\\", "/")` 然后字符串包含判断**——这是**反模式**：`(file_path, project_id)`归属判定应该走 `core/paths.is_in_subfolder()`（已有），不要在 router 里重复实现字符串规范化。文件 service (`file_service.ingest_path`)用了 `is_in_subfolder`，但 router 又重写一遍，导致两处归属判定逻辑漂移。建议把 unclaimed 也归到 service 层一个函数 `list_unclaimed_in_project(db, project_id)`，router 只调用。优先级 P2。

- **I2: `pages/ProjectDetail.tsx:387-399` 自定义 `useProject` hook注释里写「T-FE-A 的 useProjects hook还没就绪也能跑」**——但 `hooks/useProjects.ts:62` 的 `useProject(id)` 已经存在。这条注释是历史遗留，建议删掉以免误导。同时 ProjectDetail 用 `useProject` 而不是 `useProjects().byId`，导致两个不同的 query key（`['project', id]` vs `projectKeys.byId(id)`），mutations invalidate 一个，轮询的是另一个——会出现「mutation成功但 UI 不刷」的极端场景。统一 query key 是必须的。优先级 P1（潜在 stale state，但3 秒轮询兜底）。

- **I3: `services/file_service.py:117,170` 有两次 `db.refresh(f)`，但 ingest_path 的「已有 file」分支（line102）和「新建」分支（line117）行为不一致**——已有分支直接 commit + return existing，**不 refresh**；新建分支 refresh。这两个路径返回的对象 attribute 一致性靠 SQLAlchemy缓存，新版本里若有人改 `existing.uploaded_at = _now()` 后立即读，会拿到 stale datetime。统一在 commit 后 `db.refresh(existing)` 更稳。优先级 P2。

- **I4: `frontend/src/components/UnclaimedFiles.tsx:41-57` `handleAssign` 函数实现了"指派"语义，但实际只是 `refreshItem(itemId)`**——这是产品语义造假，UI 显示「指派给某项」按钮，但 hint 文案写「请把文件手动移到对应子文件夹」。要么实现真正的 assign端点（POST `/api/items/{id}/files/{file_id}/assign`），要么把按钮文案改诚实（「触发该子文件夹扫描」）。当前处于半成品状态，对用户心智有害。优先级 P2。

- **I5: `routers/settlement.py:62-67` `build`路由是**同步阻塞 +异常统一抛500**，但 `settlement_builder.py:264-269` 已经把 status 设成 failed 并写日志**——router5xx抛出后，前端 toast 显示「生成失败: <error>」，同时 DB已有 failed log。两边都在「记失败」，有点冗余但不致命。建议把 router 的 try/except去掉，让 `global_exception_handler`兜底，或者 builder 直接 raise ValueError 让 router 转409（语义更准：build失败通常是项目状态不合法）。优先级 P3。

## Minor（可选）

- **M1: `routers/projects.py:22-37` `_to_response`是个简单 mapping，但 `pages/Settlement.tsx:233-244` `ReadinessCard` 的 prop 名与文件结构耦合**——`ReadinessCard`接受7 个独立 props，调用点 spread 一片长 prop list。重构方向：要么传 `phase + job + preview + project` 大对象，要么保留分 prop 但加一个 `ReadinessCardProps extends PhaseState` 类型别名。当前能跑，但维护时新增 phase 时容易漏 prop。
- **M2: `services/watcher_service.py:48` `_scan_projects_dir` 用 `rglob("*")` 全量遍历 +重建 snapshot，对于100+ 项目 + 千级文件时会成为 O(n)热点**。当前规模下没问题，但要写进 README 让未来 maintainer知道这是 O(n) 而不是 incremental。
- **M3: `frontend/src/lib/format.ts:80-92` `formatRelativeTime` 没有 i18n /边界条件（如未来时间 → 显示「即将」而不是「刚刚」）**。v0.1.0不会撞，但加一行 `if (diff <0) return '即将'`成本极低。
- **M4: `services/settlement_builder.py:111-148` `_draw_toc` 用 magic数字（`2*cm,3.5*cm,11*cm,13*cm,15.5*cm,0.6*cm`）——布局硬编码**。如果未来要支持横向或不同纸张，重构成本高。提一个 `TOC_LAYOUT` dataclass统一管理是好习惯。
- **M5: `frontend/src/api/items.ts:32-39` `AddItemResponse extends Item`嵌套一个 `promote_prompt` 对象字段（dead type）**，但 service 层从不返回这个字段——纯死代码。建议删除整个 `promote_prompt` 分支。
- **M6: `frontend/src/pages/ProjectNewTemplate.tsx:51-59` 用 `tmp-${Date.now()}-${Math.random().toString(36).slice(2,7)}` 生成 temp id**——和 `store/app.ts:62-66` 的 toast id 生成逻辑重复，且都不如 `crypto.randomUUID()` 安全/简单。提一个 `lib/id.ts` 共用。

---

总评：项目代码整体质量很高——Pydantic schema + SQLAlchemy ORM + TanStack Query 的契约对齐做得不错，配置全部走 ENV，状态机定义明确，watcher 双轨降级务实。Critical 项里只有 C1 会真正影响前端功能（C2/C3 是健壮性问题），I2 的 query key漂移是潜在 stale-state 但有3s轮询兜底。不建议为这次审查做大改，主要应该把 C1 + I2 + I4 这三条修掉。
