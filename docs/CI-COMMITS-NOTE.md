# CI/CD commits 说明（实事求是版）

> 创建于 2026-06-11，由 hermes-agent 在用户澄清后补写。

## 这 3 个 commit 的真相

| SHA | Author 字段 | 实际 | 状态 |
|---|---|---|---|
| `62addf6` | Mavis &lt;Mavis@local&gt; | 用户本人在另一台机器用此 author 做的 CI/CD 实验第 1 步：写 workflow | **broken**（工作，但跟后面 commit 冲突）|
| `e6eed62` | Mavis &lt;Mavis@local&gt; | 用户第 2 步：修 CI 失败（fixture + tsbuildinfo）| **broken**（workaround 引入，**不持久**，被下一步删了）|
| `4edd886` | Mavis &lt;Mavis@local&gt; | 用户第 3 步："回退 CI 改动，明日重启"—— **只删了 1 个 fixture 文件**，**workflow / conftest / .gitignore 都未真回退** | **dirty**（commit message 与实际不符）|

**Author 字段是 git 不可变历史**——不能改。`Mavis@local` 是当时那台机器 git config 的 user.email，跟 hermes-agent 无关，**不是另一个 agent 推的**。

## 为什么没改 SHA / rebase 抹掉

- `5a8aeba` 之后有 deploy worktree（`/root/repos/settlement-mgmt-deploy`）引用 `42aa1bc`，rebase 会改 SHA，破引用
- 改 author 需 force push，破坏 origin 历史 + 别人/自己的 clone
- 这 3 个 commit **实际上不破坏 main 任何功能**——CI workflow 是按事件触发，**没人主动 push 触发就不会跑**；broken fixture 也只在 CI runner 上失效

## 给后来看 main 的人的 1 句话

**这 3 个 commit 是实验残骸，请勿在没读懂 .github/workflows/ci.yml + 还原 `backend/tests/fixtures/master_template.json` 之前在 main 上 push / 打 tag 触发 CI。** 真要重启 CI 工作，请开新分支 `feat/ci-restart`，**不要 rebase 这 3 个 commit**。

## 相关 SHA

- HEAD: `5a8aeba` (本说明创建后)
- 我们 3 个新功能 commit: `f79394f` → `bd57e2a` → `42aa1bc`
- 共同祖先: `fa78935`
