# 阶段 1：构建（装依赖）
FROM python:3.11-slim AS backend-base

# 容器内不缓存 .pyc，stdout/stderr 不缓冲（看日志实时）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 切到国内镜像源（Debian bookworm）— 官方 deb.debian.org 偶发 502
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null \
    || sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list

# 系统依赖：fonts-arphic-uming (明体=宋体风格) + fonts-arphic-ukai (楷黑=黑体风格) 兜底中文字体
# 修 C-font (REVIEW-TRACK3 C-font) + 用户要求"正文宋体、标题黑体"：
#  - 之前 fonts-noto-cjk 是 OpenType PostScript outlines，reportlab 4.x 不支持解析
#  - 之后改 fonts-wqy-microhei 只有黑体风格一种字体，body+heading 都用同一个（没区分宋黑）
#  - 改装 arphic 套件：uming (宋体替身) + ukai (黑体替身)，体积小、TrueType 兼容
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-arphic-uming \
        fonts-arphic-ukai \
        tini \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先 COPY requirements 利用 Docker 缓存
COPY requirements.txt .
RUN pip install -r requirements.txt

# 再 COPY 业务代码
COPY app/ ./app/
COPY seeds/ ./seeds/
COPY scripts/ ./scripts/

# 容器内默认路径（CORS_ORIGINS 在 docker-compose.yml 用 list 语法注入）
# 修 M-port (REVIEW-TRACK2 M1 / REVIEW-TRACK3 M-port)：PORT 与 EXPOSE/CMD 一致
ENV DATA_DIR=/data \
    PROJECTS_DIR=/projects \
    DB_PATH=/data/settlement.db \
    TEMPLATE_PATH=/data/master_template.json \
    HOST=0.0.0.0 \
    PORT=18000

# 健康检查：后端 18000 /api/health
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -fsS http://127.0.0.1:18000/api/health || exit 1

EXPOSE 18000

# tini 包装 uvicorn，正确处理 SIGTERM（docker stop）
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "18000", "--workers", "1"]
