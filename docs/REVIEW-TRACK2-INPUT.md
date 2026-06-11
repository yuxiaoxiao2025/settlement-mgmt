# 任务：项目代码审查 — Track 2：独立测试覆盖 / 边界 / 安全 / 集成

## 范围
**整个项目**（E:\trae-pc\260609work2，130 个 git 跟踪文件，HEAD=c19c536）。

## 你的任务
作为 **verifier agent**，独立于开发视角，审查：

### 重点审查
1. **测试覆盖**：
   - 后端 pytest：覆盖率（112 tests 是否够）？
   - 前端 vitest：61 tests 是否覆盖关键路径？
   - **缺失的测试场景**（基于用户实际功能列出来）：
     - 删除项目：磁盘目录是否真清空？子文件夹内容呢？
     - 归档：边缘 case（0 项项目、25 项都 confirmed、其中一项 rejected）
     - 结算书预览：inline 头真的在所有中间件（nginx 反代）保留吗？
     - 模板多选：selected_template_seqs 重复 seq、空字符串、负数
     - 两步流程：第 1 步 state 丢失后能恢复吗？
2. **安全**：
   - 路径遍历（safe_join 实现是否真的安全？）
   - 文件名消毒（中文/特殊字符/超长）
   - SQL 注入（用了 ORM，但 raw query 呢？）
   - CORS 配置（生产模式安全吗？）
   - DELETE 接口（无鉴权 → 局域网滥用风险）
3. **边界**：
   - 25 项全空的 template 行为
   - 项目 deadline 在过去 → 后端拒绝？
   - 并发 confirm 同一项
   - 100MB+ 大文件上传
   - 文件被同时覆盖
4. **集成**：
   - docker compose 健康检查足够吗？
   - watcher 在容器内 vs 宿主机文件时间戳差异
   - 前后端 API 契约是否一致（看 `frontend/src/types/index.ts` vs `backend/app/schemas.py`）
   - nginx 反代配置（gzip / cache / 静态资源 / SPA fallback）

### 输出
**一段 500-1500 字的审查报告**，结构：
```
## 覆盖良好的地方
- ...

## Critical（必须修 — 安全 / 数据丢失）
- C1: ...（位置: file:line + 复现步骤 + 修复建议）
- C2: ...

## Important（建议修 — 测试缺失 / 集成风险）
- I1: ...
- I2: ...

## Minor（可选 — 文档 / 优化）
- M1: ...
```

### 不要做
- 不要做修改
- 不要复述 docs/REVIEW.md / docs/DEEP-REVIEW.md 已列的（那两轮已审过）
- 不要超过 1500 字
- 不要 generic 建议（"加点单元测试"这种废话别说）

### 重要：可证伪 + 具体
- 提的问题必须能"复现"或"指文件:行号"
- 给真实的攻击场景或复现步骤
- 实事求是，代码好的就明说"这没问题"

## 工作模式
- 用 explore / read 工具看代码
- 重点：`backend/app/core/paths.py`（安全）、`backend/app/routers/`（删除/归档）、`backend/tests/`（覆盖盲点）、`frontend/nginx.conf`（反代）、`docker-compose.yml`（健康检查）
- 看 `backend/app/services/watcher_service.py`（容器内文件监控）
- 最后输出报告
