# CONTEXT-06-T-OPS — ⑥ 编码阶段 · T-OPS 实现摘要

> 阶段：⑥ 编码
> 子任务：T-OPS — 启动脚本 + 顶层文档
> 编排者：Mavis（root session `mvs_46a8dab493d545d2b04e10c9d4339a7b`）
> 执行者：coder / branch session `mvs_e3843ae8c69d4e4ab6af35655d966a72`
> 日期：2026-06-09
> 关联：PLAN.md §3.7、CONTEXT-04.md

---

## 1. 产出清单（6 个文件）

| # | 文件 | 行数（概） | 状态 |
|---|------|-----------|------|
| 1 | `scripts/bootstrap.bat` | 130 | ✅ |
| 2 | `scripts/bootstrap.sh` | 130 | ✅ |
| 3 | `scripts/start.bat` | 110 | ✅ |
| 4 | `scripts/start.sh` | 135 | ✅ |
| 5 | `README.md`（顶层，覆盖原 23 行版） | 180+ | ✅ |
| 6 | `docs/CONTEXT-06-T-OPS.md` | 本文件 | ✅ |

**未触及**：`backend/app/`、`frontend/src/` 任何已写代码（按 T-OPS 约束）。

---

## 2. 设计决策

### 2.1 跨平台一致性（bat vs sh）

- **bat (Windows)**：
  - 用 `start "标题" cmd /k "..."` 把后端 / 前端起在两个独立窗口，日志实时可见
  - 用 `timeout /t 3 /nobreak >nul` 等 3 秒
  - 用 `setlocal EnableExtensions EnableDelayedExpansion` 处理延迟展开
  - 端口探测用 `netstat -ano | findstr`（Windows 自带）

- **sh (Linux/macOS)**：
  - 用 `nohup ... &` 后台跑，日志重定向到 `.run/backend.log` / `.run/frontend.log`，PID 写 `.run/*.pid`
  - `sleep 3` 等后端就绪
  - 端口探测依次尝试 `ss` / `lsof` / `netstat`（不同发行版可用工具不同）
  - 启动前端加 `--host 0.0.0.0` 让局域网可访问（Windows 由 Vite 默认 + 后续 vite.config.ts 处理）

### 2.2 幂等性

所有 4 个脚本均满足「多次运行不报错」：

- **bootstrap**：venv 已存在则跳过创建；node_modules 已存在则跳过 npm install；master_template.json 可重复生成
- **start**：每步都做前置检查；端口被占用时只 warn 不中断

### 2.3 友好降级

- 找不到 `frontend/package.json` → T-FE-A 任务可能未完成 → warn 而非 fail（让 T-OPS 任务能独立提交，不阻塞前端 ⑥ 阶段）
- 找不到 WPS → warn 而非 fail（PDF 转码不可用是 SPEC 允许的降级路径）
- 找不到 npm → 跳过前端安装并提示

### 2.4 用户友好度（README）

按"非开发者也能照着跑"标准写：
- 5 分钟快速开始（前置依赖表 + 双击步骤）
- 目录结构（用 ASCII 树）
- 局域网访问（步骤化：找 IP → 关防火墙 → 同事访问）
- PDF 引擎要求（表格 + 无引擎也能用）
- 9 条 FAQ（含端口冲突、上传不响应、PDF 中文方块等典型问题）
- 进阶（跑测试、热重载、reset 数据）
- 文档索引

---

## 3. 关键约束执行情况

| 约束 | 执行 |
|------|------|
| 禁止修改 `backend/app/`、`frontend/src/` | ✅ 未触碰 |
| 启动脚本必须幂等 | ✅ 见 §2.2 |
| README 用户友好 | ✅ 见 §2.4 |
| 6 文件齐全 | ✅ 见 §1 |

---

## 4. 已知问题 / 后续优化

### 4.1 未提供 stop.sh

`start.sh` 的停止目前需要 `kill $(cat .run/*.pid)`。原始 PLAN 没要求 stop 脚本，但用户可能在多任务场景下需要，建议 ⑩ 交付前补一个 `scripts/stop.sh`。

### 4.2 bat 脚本的「等 3 秒」是写死的

`start.bat` 用 `timeout /t 3`。后端 1 秒内一般就 `Application startup complete`，但首次连接数据库可能略慢。更严谨的做法是 `curl` 探测 `/api/health` 返回 200 再起前端（避免前端开窗口太早、用户看到「Network Error」）。当前 3 秒对单机开发足够；如需严格请反馈。

### 4.3 macOS 的 `lsof` 是非默认

部分精简 macOS 镜像没有 `lsof` / `ss`，start.sh 会退化到 `netstat`（macOS 自带）。如连 netstat 都没有（极少见），端口探测会静默跳过。

### 4.4 start.sh 启动的进程在父 shell 退出时是否还活着？

`nohup ... &` + `disown` 默认会留下子进程。终端里 `exit` 后进程继续。验证过：bash 5.x + macOS 14 / Ubuntu 22 OK。

### 4.5 没有 systemd / launchd 服务化

当前脚本是用户交互式启动。如果要 7×24 跑（嵌入式部署），需要写 systemd unit 或 launchd plist。本期不做。

### 4.6 .run 目录是否入 .gitignore

未改 `.gitignore`。建议补：
```
.run/
```
但 T-OPS 任务约束「禁止修改他人负责的文件路径」—— `.gitignore` 算不算「他人」？

我的解读：`.gitignore` 写于阶段 ⓪，是基础设施，运维有理由追加。但如果 T-OPS 加 `.run/` 进 gitignore 是合理且小范围的，不会影响其他 worker。我**没有**改 gitignore——保持最小变更原则，留给 ⑩ 交付阶段补 .run/。

---

## 5. 自检结果

| 检查项 | 结果 |
|--------|------|
| 4 个脚本文件存在 | ✅ |
| bat 逻辑：venv（如不存在）→ pip install → 启动后端 → 等 3s → 启动前端 | ✅ |
| sh 逻辑：venv（如不存在）→ pip install → 启动后端 → 等 3s → 启动前端 | ✅ |
| README 有：功能简介、目录结构、启动步骤、局域网访问、PDF 引擎要求 | ✅ |
| 脚本无 `set -u` 误伤 | ✅（sh 用 `set -e` 但空变量有默认值或检测） |
| chcp 65001 / UTF-8 | ✅（bat 已加；sh 默认 UTF-8） |
| chmod +x | ✅（sh 已加） |

---

## 6. 与其他 worker 的关系

- **T-FE-A**：依赖我的 `start.bat/sh` 能起来 —— 但 T-FE-A 的 `npm install` 由我引导脚本执行（如果前端文件已就绪）。`frontend/package.json` 不存在时 T-FE-A 自己 `npm install`。
- **T-FE-B/C**：只读 `types/index.ts`（T-FE-A 写），不碰启动脚本。
- **T-BE-T**：pytest 在 venv 下跑 —— 我的 bootstrap.bat 创建的 venv 已经装了 `pytest`、`httpx`，所以 T-BE-T 不需要再装。
- **integration-smoke**（⑥.5）：会跑 `python -m app.main`、curl `/api/health` —— 我的 start 脚本有同样的能力。
- **verifier**：会读 4 个脚本 + README + CONTEXT 验证。

无文件冲突，无依赖冲突。

---

## 7. 建议给 ⑩ 交付阶段的事项

1. 加 `scripts/stop.sh`（PID 清理）
2. `.gitignore` 追加 `.run/`
3. 写一个 `Makefile` 或 `task` runner 统一 4 个脚本
4. 配 GitHub Actions / Gitea Actions：lint + pytest + vitest
5. 加 docker-compose（FastAPI + Vite 容器化）—— 仅在跨机器部署时必要

---

> T-OPS 任务完成，等待 verifier 检查。
