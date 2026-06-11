# ─────────────────────────────────────────────────────────
# 阶段 1：构建（Node 22 alpine）
# ─────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build

WORKDIR /app

# 优先 COPY 依赖文件，最大化 Docker 缓存命中率
COPY package.json package-lock.json* ./

# ci 优先，失败回退 install（兼容无 lockfile 场景）
RUN npm ci --no-audit --no-fund --prefer-offline || npm install --no-audit --no-fund

# 拷贝源码
COPY tsconfig.json tsconfig.node.json ./
COPY index.html ./
COPY postcss.config.js tailwind.config.js ./
COPY vite.config.ts ./
COPY src/ ./src/

# 生产构建
RUN npm run build

# ─────────────────────────────────────────────────────────
# 阶段 2：运行（nginx 1.27 alpine）
# ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS frontend-run

# 删掉 nginx 默认配置
RUN rm /etc/nginx/conf.d/default.conf

# 我们的 nginx 配置：80 端口 serve dist/ + /api 反代到 backend:8000
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
