#!/usr/bin/env bash
# ─────────────────────────────────────────
#  项目结算资料管理 — Docker 停止
# ─────────────────────────────────────────
set -e
cd "$(dirname "$0")/.."

echo "正在停止 Docker 服务..."
docker compose down

echo
echo "已停止。如需清理数据（数据库+项目），手动删除 data/ 和 projects/ 目录。"
