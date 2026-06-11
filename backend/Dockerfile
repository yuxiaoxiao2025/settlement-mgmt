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

# 系统依赖：fonts-noto-cjk 兜底中文字体 / tini 做 PID 1 / curl 做 healthcheck
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-noto-cjk \
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
ENV DATA_DIR=/data \
    PROJECTS_DIR=/projects \
    DB_PATH=/data/settlement.db \
    TEMPLATE_PATH=/data/master_template.json \
    HOST=0.0.0.0 \
    PORT=8000

# 健康检查：后端 8000 /api/health
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

EXPOSE 8000

# tini 包装 uvicorn，正确处理 SIGTERM（docker stop）
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
