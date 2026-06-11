#!/usr/bin/env bash
# ─────────────────────────────────────────
#  项目结算资料管理 — Docker 一键启动（macOS / Linux）
# ─────────────────────────────────────────
set -e

cd "$(dirname "$0")/.."

echo "========================================"
echo "  项目结算资料管理 — Docker 启动"
echo "========================================"
echo

# 1) 探测 docker
if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] 未检测到 docker，请先安装 Docker Desktop"
    echo "        https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# 2) 探测 compose 插件
if ! docker compose version >/dev/null 2>&1; then
    echo "[ERROR] 未检测到 docker compose 插件"
    echo "        Docker Desktop 4.x+ 已自带，老版本请升级"
    exit 1
fi

# 3) 探测 docker daemon
if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker Desktop 未运行，请先启动它"
    exit 1
fi

# 4) 确保 data/ projects/ 目录存在
mkdir -p data projects

# 5) 首次构建 + 启动；非首次只启动
docker compose up -d --build

echo
echo "========================================"
echo "  启动成功！"
echo "  浏览器打开: http://localhost:18080"
echo "  后端直连:   http://localhost:18000/api/health"
echo "  查日志:     docker compose logs -f"
echo "  停服务:     docker compose down"
echo "========================================"
echo

# 6) 拉起浏览器
sleep 3
if command -v open >/dev/null 2>&1; then
    open http://localhost:18080
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:18080
fi
