#!/usr/bin/env bash
# ============================================================
#  bootstrap.sh - 项目结算资料管理 首次引导脚本 (Linux/macOS)
#
#  用途：在干净的 Linux/macOS 机器上一次性完成环境准备：
#    1. 检查 python3 / node / npm 环境
#    2. 创建 backend/.venv（如不存在）
#    3. pip install 后端依赖
#    4. 解析项目结算资料交接清单.docx -> data/master_template.json
#    5. npm install 前端依赖
#    6. 探测 WPS / LibreOffice（PDF 引擎）
#
#  幂等：可重复运行，已就绪的步骤会自动跳过。
#
#  用法：bash scripts/bootstrap.sh
# ============================================================

set -e

# 切到项目根
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
PROJECT_ROOT="$(pwd)"

echo
echo "============================================================"
echo "  项目结算资料管理 — 首次引导"
echo "  工作目录: $PROJECT_ROOT"
echo "============================================================"
echo

# ---------- 0. 颜色 + 工具函数 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
info()  { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; }

# ---------- 1. 检查 Python ----------
echo "[1/6] 检查 python3 ..."
if ! command -v python3 >/dev/null 2>&1; then
    fail "找不到 python3，请先安装 Python 3.10+"
    echo "       macOS: brew install python@3.12"
    echo "       Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi
PY_VERSION="$(python3 --version 2>&1)"
info "$PY_VERSION"

# ---------- 2. 创建后端虚拟环境 ----------
echo
echo "[2/6] 创建后端虚拟环境 ..."
if [ ! -x "backend/.venv/bin/python" ]; then
    (cd backend && python3 -m venv .venv) || {
        fail "创建 venv 失败"
        exit 1
    }
    info "venv 已创建"
else
    echo "  [SKIP] venv 已存在"
fi

# ---------- 3. 安装后端依赖 ----------
echo
echo "[3/6] 安装后端依赖 (pip install -r requirements.txt) ..."
# shellcheck disable=SC1091
source backend/.venv/bin/activate
python -m pip install --upgrade pip --quiet
pip install -r backend/requirements.txt --quiet || {
    fail "pip install 失败，请检查网络"
    deactivate 2>/dev/null || true
    exit 1
}
info "后端依赖安装完成"
deactivate 2>/dev/null || true

# ---------- 4. 解析 docx 模版 ----------
echo
echo "[4/6] 解析 docx 模版 -> data/master_template.json ..."
if [ ! -f "项目结算资料交接清单.docx" ]; then
    fail "找不到 项目结算资料交接清单.docx"
    echo "      请把模版文件放到项目根目录后重跑"
    exit 1
fi
# shellcheck disable=SC1091
source backend/.venv/bin/activate
(cd backend && python scripts/bootstrap_template.py) || {
    fail "解析模版失败"
    deactivate 2>/dev/null || true
    exit 1
}
deactivate 2>/dev/null || true
info "模版已生成"

# ---------- 5. 安装前端依赖 ----------
echo
echo "[5/6] 安装前端依赖 (npm install) ..."
if ! command -v npm >/dev/null 2>&1; then
    warn "找不到 npm，跳过前端依赖安装"
    echo "      请安装 Node.js 18+: https://nodejs.org/"
elif [ ! -f "frontend/package.json" ]; then
    warn "找不到 frontend/package.json"
    echo "      T-FE-A 任务可能尚未完成，跳过 npm install"
else
    if [ ! -d "frontend/node_modules" ]; then
        (cd frontend && npm install) || {
            fail "npm install 失败，请检查网络或 npm 配置"
            exit 1
        }
    else
        echo "  [SKIP] node_modules 已存在"
    fi
    info "前端依赖安装完成"
fi

# ---------- 6. 探测 PDF 引擎 ----------
echo
echo "[6/6] 探测 PDF 引擎 (WPS / LibreOffice) ..."
if command -v wps >/dev/null 2>&1; then
    info "wps 在 PATH: $(command -v wps)"
elif command -v soffice >/dev/null 2>&1; then
    warn "未找到 WPS，但找到了 LibreOffice (soffice)"
    echo "      Linux 上需要手动改 backend/app/services/pdf_converter.py 用 soffice 替代 wps"
    echo "      或安装 WPS: https://linux.wps.cn/"
elif [ -x "/usr/bin/wps" ] || [ -x "/opt/kingsoft/wps-office/wps" ]; then
    info "找到 WPS: /opt/kingsoft/wps-office/wps"
else
    warn "未找到 WPS / LibreOffice"
    echo "      PDF 转码功能将不可用（仅支持直接上传 PDF）"
    echo "      安装 LibreOffice: sudo apt install libreoffice"
fi

echo
echo "============================================================"
echo "  引导完成！"
echo "  下一步：bash scripts/start.sh 启动服务"
echo "============================================================"
echo
