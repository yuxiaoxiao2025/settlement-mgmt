#!/usr/bin/env bash
# ============================================================
#  start.sh - 项目结算资料管理 一键启动 (Linux/macOS)
#
#  用途：同时启动后端 (FastAPI) + 前端 (Vite) 两个服务
#        日志重定向到 .run/ 目录，可用 tail -f 跟踪
#
#  前置：先运行过 scripts/bootstrap.sh
#
#  用法：bash scripts/start.sh
#  停止：bash scripts/stop.sh  （或手动 kill 后端 / 前端 PID）
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
PROJECT_ROOT="$(pwd)"

# 默认端口（与 backend/app/config.py 一致）
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# 运行日志目录
RUN_DIR="$PROJECT_ROOT/.run"
mkdir -p "$RUN_DIR"

echo
echo "============================================================"
echo "  项目结算资料管理 — 一键启动"
echo "  工作目录: $PROJECT_ROOT"
echo "============================================================"
echo

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
info()  { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; }

# ---------- 0. 前置检查 ----------
echo "[0/4] 前置检查 ..."

if [ ! -x "backend/.venv/bin/python" ]; then
    fail "找不到 backend/.venv/bin/python"
    echo "      请先运行 scripts/bootstrap.sh 完成环境引导"
    exit 1
fi
info "后端 venv 就绪"

if [ ! -f "data/master_template.json" ]; then
    warn "找不到 data/master_template.json"
    echo "      建议先运行 scripts/bootstrap.sh 重新生成模版"
fi

if [ ! -f "frontend/package.json" ]; then
    fail "找不到 frontend/package.json"
    echo "      T-FE-A 任务可能尚未完成"
    exit 1
fi
info "前端 package.json 就绪"

# ---------- 1. 探测端口 ----------
echo
echo "[1/4] 探测端口 ..."

check_port() {
    local port=$1
    if command -v ss >/dev/null 2>&1; then
        ss -ltn "sport = :$port" 2>/dev/null | tail -n +2 | grep -q LISTEN
    elif command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    elif command -v netstat >/dev/null 2>&1; then
        netstat -ltn 2>/dev/null | grep -q ":$port "
    else
        return 1
    fi
}

if check_port "$BACKEND_PORT"; then
    warn "端口 $BACKEND_PORT 已被占用，可能后端已在运行"
else
    info "后端端口 $BACKEND_PORT 空闲"
fi

if check_port "$FRONTEND_PORT"; then
    warn "端口 $FRONTEND_PORT 已被占用，可能前端已在运行"
else
    info "前端端口 $FRONTEND_PORT 空闲"
fi

# ---------- 2. 启动后端 ----------
echo
echo "[2/4] 启动后端 (FastAPI :$BACKEND_PORT) ..."
# shellcheck disable=SC1091
source backend/.venv/bin/activate
cd backend
nohup python -m app.main > "$RUN_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$RUN_DIR/backend.pid"
cd "$PROJECT_ROOT"
deactivate 2>/dev/null || true
info "后端已启动 PID=$BACKEND_PID  日志: $RUN_DIR/backend.log"

# ---------- 3. 等 3 秒 ----------
echo
echo "[3/4] 等待 3 秒让后端就绪 ..."
sleep 3
info "继续"

# ---------- 4. 启动前端 ----------
echo
echo "[4/4] 启动前端 (Vite :$FRONTEND_PORT) ..."
cd frontend
nohup npm run dev -- --host 0.0.0.0 > "$RUN_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$RUN_DIR/frontend.pid"
cd "$PROJECT_ROOT"
info "前端已启动 PID=$FRONTEND_PID  日志: $RUN_DIR/frontend.log"

# ---------- 5. 探测本机 IP（供局域网访问） ----------
echo
echo "============================================================"
echo "  启动完成！"
echo
echo "  本机访问："
echo "    前端:      http://localhost:$FRONTEND_PORT"
echo "    后端:      http://localhost:$BACKEND_PORT"
echo "    API 文档: http://localhost:$BACKEND_PORT/docs"
echo
echo "  局域网访问（把 localhost 换成下面的 IP）："
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$HOST_IP" ] && HOST_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -n "$HOST_IP" ]; then
    echo "    http://$HOST_IP:$FRONTEND_PORT"
fi
echo
echo "  跟踪日志："
echo "    tail -f $RUN_DIR/backend.log"
echo "    tail -f $RUN_DIR/frontend.log"
echo
echo "  停止服务："
echo "    kill \$(cat $RUN_DIR/backend.pid $RUN_DIR/frontend.pid)"
echo "    （或：bash scripts/stop.sh —— 如果该脚本存在）"
echo "============================================================"
echo
