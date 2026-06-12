# 公网部署指南（v0.3.1+）

> 适用：单服务器公网部署（Docker Compose 模型）
> 数据位置：**宿主机**文件系统，不是容器内

## 路径速查

公网服务器 SSH 进去后：

```bash
# 假设你 git clone 到 /opt/settlement-mgmt
cd /opt/settlement-mgmt
ls -la
# 看到：backend/  frontend/  scripts/  docker-compose.yml  .env  .env.example
#        data/                ← SQLite DB + 访问日志（容器卷挂载）
#        projects/            ← 项目文件实际存储（容器卷挂载）
```

**每个项目 = 一个 UUID 目录**：
```
projects/
  ├── a1b2c3d4-1234-5678-.../    ← 项目 A
  │   ├── 01_招标文件/
  │   ├── 02_合同/
  │   ├── _unclaimed/              ← 暂存区（批量上传落这）
  │   └── .pdfs/                   ← 合并 PDF 缓存
  └── e5f6g7h8-.../                ← 项目 B
```

## 必读：跨平台兼容

- fix-loop 已修：**DB 存项目相对路径**（不是 `E:\...` 绝对路径）
- 同 OS 内 / 跨 OS 迁移 `projects + data` 都不需要改 DB

## 部署步骤（最简）

```bash
# 1. 上传代码（rsync / scp / git clone）
cd /opt/settlement-mgmt

# 2. 写 .env（如果克隆没带 .env）
cp .env.example .env
# 修改 4 个 secret（admin 密码 / 站点验证码 / JWT_SECRET / CORS_ORIGINS）
# 生成强随机 JWT_SECRET: python -c "import secrets; print(secrets.token_urlsafe(64))"
# 生成 bcrypt 密码: python -c "from passlib.hash import bcrypt; import sys; print(bcrypt.hash(sys.argv[1]))" YOUR_PASSWORD

# 3. 启动
bash scripts/docker-up.sh
# 或 Windows 远程桌面: scripts\docker-up.bat

# 4. 验证
curl http://YOUR_PUBLIC_IP:18080/api/health
# → {"status":"ok","watcher":true,"watcher_mode":"watchdog","wps":false}
```

## 备份策略（生产必做）

**`projects/` 和 `data/` 必须成对备份** —— 只备份一个会数据失同步。

```bash
# 建议 cron: 每天凌晨 3 点备份到 /backup/settlement/YYYY-MM-DD/
0 3 * * * /opt/settlement-mgmt/scripts/backup.sh
```

**backup.sh 模板**（如需可实现）：

```bash
#!/bin/bash
set -e
DATE=$(date +%Y-%m-%d)
BACKUP_DIR=/backup/settlement/$DATE
mkdir -p $BACKUP_DIR
cd /opt/settlement-mgmt
tar -czf $BACKUP_DIR/projects.tar.gz projects/
# SQLite 备份用 .backup 命令（保证 consistency），不要 cp
sqlite3 data/settlement.db ".backup $BACKUP_DIR/settlement.db"
# 保留 30 天
find /backup/settlement -type d -mtime +30 -exec rm -rf {} +
```

## HTTPS / 域名（公网必需）

`docker-compose.yml` 当前是 HTTP。公网建议：

- **前置 nginx + Let's Encrypt**（certbot）
- nginx 反代到 `localhost:18080`，加 HTTPS
- cookie `secure=True` 自动生效（生产 HTTPS 环境）

## 监控 / 日志

```bash
# 实时日志
docker compose logs -f

# 健康检查
curl http://localhost:18080/api/health

# 数据库访问日志
sqlite3 data/settlement.db "SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT 50"
```

## 升级流程

```bash
cd /opt/settlement-mgmt
git pull
bash scripts/docker-up.sh   # 自动 rebuild
```

## 风险与限制

| 风险 | 影响 | 缓解 |
|---|---|---|
| 单服务器单盘 | 硬盘故障 = 数据全丢 | RAID + 异地备份 |
| SQLite 单文件 | 多写入并发有限（公网少量用户 OK） | 高并发场景改 PostgreSQL |
| 200MB 单文件上限 | 巨型项目文件上传受限 | 改 docker-compose `client_max_body_size`（已 500M）+ 后端 `MAX_UPLOAD_BYTES` |
| 25 项固定清单 | 模版调整需重 build | 当前是项目固定（看 SPEC） |
| `_unclaimed` 没自动归档 | 用户上传后需手动指派 | UnclaimedFiles 区"指派"功能（待实现） |

## 跨机器迁移

```bash
# 旧机器
cd /opt/settlement-mgmt
tar -czf migration.tar.gz projects/ data/

# scp 到新机器
scp migration.tar.gz new:/opt/

# 新机器
cd /opt/settlement-mgmt
tar -xzf /opt/migration.tar.gz
bash scripts/docker-up.sh
# 完成（DB 路径已是项目相对，无需迁移脚本）
```

## 已知遗留决策（不在 v0.3.1 范围）

- `_unclaimed` 文件 → 具体 item 的"指派"后端只 stub（`refresh_item` 兜底）
- 不支持的模版（需要新增项时改源 docx + 重新 bootstrap_template.py）
- WPS 转换在容器内没装（公网部署 docx/xlsx 走非 PDF 路径预览受限）
