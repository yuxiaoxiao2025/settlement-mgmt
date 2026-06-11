@echo off
REM ─────────────────────────────────────────
REM  项目结算资料管理 — Docker 一键启动（Windows）
REM ─────────────────────────────────────────
chcp 65001 >nul
setlocal

cd /d "%~dp0\.."

echo ========================================
echo   项目结算资料管理 — Docker 启动
echo ========================================
echo.

REM 1) 探测 docker
where docker >nul 2>nul
if errorlevel 1 (
    echo [ERROR] 未检测到 docker，请先安装 Docker Desktop
    echo         https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

REM 2) 探测 compose 插件
docker compose version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] 未检测到 docker compose 插件
    echo         Docker Desktop 4.x+ 已自带，老版本请升级
    pause
    exit /b 1
)

REM 3) 探测 docker daemon
docker info >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker Desktop 未运行，请先启动它
    pause
    exit /b 1
)

REM 4) 确保 data/ projects/ 目录存在（避免挂载空目录）
if not exist "data" mkdir data
if not exist "projects" mkdir projects

REM 5) 首次构建 + 启动；非首次只启动
docker compose up -d --build
if errorlevel 1 (
    echo.
    echo [ERROR] 启动失败，查看日志：
    echo   docker compose logs
    pause
    exit /b 1
)

echo.
echo ========================================
echo   启动成功！
echo   浏览器打开: http://localhost
echo   后端直连:   http://localhost:8000/api/health
echo   查日志:     docker compose logs -f
echo   停服务:     docker compose down
echo ========================================
echo.

REM 6) 拉起浏览器（5s 后异步）
timeout /t 3 /nobreak >nul
start http://localhost

endlocal
