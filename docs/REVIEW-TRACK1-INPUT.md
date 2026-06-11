# 任务：项目代码审查 — Track 1：代码质量与设计

## 范围
**整个项目**（E:\trae-pc\260609work2，130 个 git 跟踪文件，HEAD=c19c536）。

核心代码目录：
- `backend/app/` — 16 个 Python 文件（FastAPI + SQLAlchemy）
- `backend/tests/` — 5 个测试文件（pytest）
- `frontend/src/` — TypeScript React 应用（Vite + TanStack Query + Tailwind）
- `docker-compose.yml` + `backend/Dockerfile` + `frontend/Dockerfile` + `frontend/nginx.conf`

## 你的任务
作为 **coder agent**，聚焦**代码质量与设计**维度：

### 重点审查
1. **代码风格**：
   - 是否一致（命名 / 缩进 / 引号 / import 顺序）
   - 是否有反模式（mutate params、magic numbers、god functions、callback hell）
2. **设计模式**：
   - React 组件是否过度/不足拆分
   - 后端 service / router 职责是否清晰
   - 是否有重复代码（DRY violations）
3. **错误处理**：
   - 边界条件（空数组、null、特殊字符、并发）
   - 异常是否被吞掉（bare except / pass）
   - 错误信息是否给开发者足够调试信息
4. **性能**：
   - N+1 查询（SQLAlchemy lazy load）
   - 重复 IO（多次读同一文件 / 多次 API 调用）
   - 前端不必要的 re-render（useMemo/useCallback 缺失/过度）
5. **可维护性**：
   - 配置是否硬编码
   - 是否有 TODO / FIXME
   - 文档/注释是否与代码一致

### 输出
**一段 500-1500 字的代码质量审查报告**，结构：
```
## 优点（3-5 条）
- ...

## Critical（必须修）
- C1: ...（位置: file:line + 描述 + 修复建议 + 优先级理由）
- C2: ...

## Important（建议修）
- I1: ...
- I2: ...

## Minor（可选）
- M1: ...
```

### 不要做
- 不要做修改（只审查）
- 不要重复别人已经发现的"集成冒烟"问题（看 docs/CONTEXT-06-integration.md）
- 不要复述 docs/REVIEW.md 已列的问题（已修过）
- 不要超过 1500 字

### 重要：实事求是
- 如果代码很好就明说"这没问题"
- 不要凑数（不要为了显得严格而硬挑刺）
- 给真实有价值的建议，不要 generic（"加点注释"这种废话别说）

## 工作模式
- 用 explore / read 工具逐个文件看
- 优先看后端 routers/、services/、models.py、config.py；前端 pages/、components/、api/、hooks/、types/
- 看 .env / docker 配置；不需要看 docs/（那是过程文档）
- 最后输出报告
