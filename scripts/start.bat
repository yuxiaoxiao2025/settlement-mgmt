@echo off
REM ============================================================
REM  start.bat - 项目结算资料管理 一键启动 (Windows)
REM
REM  用途：同时启动后端 (FastAPI) + 前端 (Vite) 两个服务
REM        在两个独立的 cmd 窗口中运行，日志可见
REM
REM  前置：先运行过 scripts\bootstrap.bat
REM
REM  用法：双击运行，或在 cmd 里 `scripts\start.bat`
REM  停止：分别关掉两个 cmd 窗口，或在任务管理器结束 python.exe / node.exe
REM ============================================================

setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

REM 切到项目根
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%.." >nul
set "PROJECT_ROOT=%CD%"

echo.
echo ============================================================
echo   项目结算资料管理 — 一键启动
echo   工作目录: %PROJECT_ROOT%
echo ============================================================
echo.

REM ---------- 0. 前置检查 ----------
echo [0/4] 前置检查 ...

REM 检查 venv
if not exist "%PROJECT_ROOT%\backend\.venv\Scripts\python.exe" (
    echo   [FAIL] 找不到 backend\.venv\Scripts\python.exe
    echo          请先运行 scripts\bootstrap.bat 完成环境引导
    popd
    endlocal
    exit /b 1
)
echo   [OK] 后端 venv 就绪

REM 检查 bootstrap_template 是否已跑（master_template.json 存在）
if not exist "%PROJECT_ROOT%\data\master_template.json" (
    echo   [WARN] 找不到 data\master_template.json
    echo          建议先运行 scripts\bootstrap.bat 重新生成模版
)

REM 检查 frontend 目录
if not exist "%PROJECT_ROOT%\frontend\package.json" (
    echo   [FAIL] 找不到 frontend\package.json
    echo          T-FE-A 任务可能尚未完成
    popd
    endlocal
    exit /b 1
)
echo   [OK] 前端 package.json 就绪

REM ---------- 1. 探测端口占用 ----------
echo.
echo [1/4] 探测端口 ...
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"

netstat -ano | findstr ":%BACKEND_PORT% " >nul 2>&1
if not errorlevel 1 (
    echo   [WARN] 端口 %BACKEND_PORT% 已被占用，可能后端已在运行
) else (
    echo   [OK] 后端端口 %BACKEND_PORT% 空闲
)

netstat -ano | findstr ":%FRONTEND_PORT% " >nul 2>&1
if not errorlevel 1 (
    echo   [WARN] 端口 %FRONTEND_PORT% 已被占用，可能前端已在运行
) else (
    echo   [OK] 前端端口 %FRONTEND_PORT% 空闲
)

REM ---------- 2. 启动后端（独立窗口） ----------
echo.
echo [2/4] 启动后端 (FastAPI :%BACKEND_PORT%) ...
start "后端服务 - FastAPI" cmd /k "cd /d ""%PROJECT_ROOT%\backend"" && call .venv\Scripts\activate.bat && echo === 后端启动中... === && python -m app.main"
if errorlevel 1 (
    echo   [FAIL] 启动后端失败
    popd
    endlocal
    exit /b 1
)
echo   [OK] 后端窗口已打开

REM ---------- 3. 等 3 秒让后端就绪 ----------
echo.
echo [3/4] 等待 3 秒让后端就绪 ...
timeout /t 3 /nobreak >nul
echo   [OK] 继续

REM ---------- 4. 启动前端（独立窗口） ----------
echo.
echo [4/4] 启动前端 (Vite :%FRONTEND_PORT%) ...
start "前端服务 - Vite" cmd /k "cd /d ""%PROJECT_ROOT%\frontend"" && echo === 前端启动中... === && npm run dev"
if errorlevel 1 (
    echo   [FAIL] 启动前端失败
    popd
    endlocal
    exit /b 1
)
echo   [OK] 前端窗口已打开

REM ---------- 5. 打印访问地址 ----------
echo.
echo ============================================================
echo   启动完成！
echo.
echo   本机访问：
echo     前端:    http://localhost:%FRONTEND_PORT%
echo     后端:    http://localhost:%BACKEND_PORT%
echo     API 文档: http://localhost:%BACKEND_PORT%/docs
echo.
echo   局域网访问（把 localhost 换成下面的 IP）：
echo     http://本机IP:%FRONTEND_PORT%
echo.
echo   停止服务：
echo     直接关掉两个 cmd 窗口，或在任务管理器结束 python.exe / node.exe
echo ============================================================
echo.
echo 按任意键关闭此窗口（不会停止后端和前端服务）...
pause >nul

popd
endlocal
exit /b 0
