@echo off
REM ============================================================
REM  bootstrap.bat - 项目结算资料管理 首次引导脚本 (Windows)
REM
REM  用途：在干净的 Windows 机器上一次性完成环境准备：
REM    1. 检查 Python / Node 环境
REM    2. 创建 backend\.venv（如不存在）
REM    3. pip install 后端依赖
REM    4. 解析项目结算资料交接清单.docx → data\master_template.json
REM    5. npm install 前端依赖
REM    6. 探测 WPS Office（PDF 引擎）
REM
REM  幂等：可重复运行，已就绪的步骤会自动跳过。
REM
REM  用法：双击运行，或在 cmd 里 `scripts\bootstrap.bat`
REM ============================================================

setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

REM 切到项目根（脚本所在目录的上一级）
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%.." >nul
set "PROJECT_ROOT=%CD%"
echo.
echo ============================================================
echo   项目结算资料管理 — 首次引导
echo   工作目录: %PROJECT_ROOT%
echo ============================================================
echo.

REM ---------- 0. 检查 Python ----------
echo [1/6] 检查 Python ...
where python >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] 找不到 python，请先安装 Python 3.10+ 并加入 PATH
    echo          下载: https://www.python.org/downloads/
    popd
    endlocal
    exit /b 1
)
for /f "delims=" %%v in ('python --version 2^>^&1') do set "PY_VERSION=%%v"
echo   [OK] %PY_VERSION%

REM ---------- 1. 创建后端虚拟环境 ----------
echo.
echo [2/6] 创建后端虚拟环境 ...
if not exist "%PROJECT_ROOT%\backend\.venv\Scripts\python.exe" (
    pushd "%PROJECT_ROOT%\backend"
    python -m venv .venv
    if errorlevel 1 (
        echo   [FAIL] 创建 venv 失败
        popd
        popd
        endlocal
        exit /b 1
    )
    popd
    echo   [OK] venv 已创建
) else (
    echo   [SKIP] venv 已存在
)

REM ---------- 2. 安装后端依赖 ----------
echo.
echo [3/6] 安装后端依赖 (pip install -r requirements.txt) ...
pushd "%PROJECT_ROOT%\backend"
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo   [FAIL] pip install 失败，请检查网络
    popd
    popd
    endlocal
    exit /b 1
)
echo   [OK] 后端依赖安装完成
popd

REM ---------- 3. 解析 docx 模版 ----------
echo.
echo [4/6] 解析 docx 模版 -> data\master_template.json ...
pushd "%PROJECT_ROOT%\backend"
call .venv\Scripts\activate.bat
if not exist "%PROJECT_ROOT%\项目结算资料交接清单.docx" (
    echo   [WARN] 找不到 项目结算资料交接清单.docx
    echo          请把模版文件放到项目根目录后重跑
    popd
    popd
    endlocal
    exit /b 1
)
python scripts\bootstrap_template.py
if errorlevel 1 (
    echo   [FAIL] 解析模版失败
    popd
    popd
    endlocal
    exit /b 1
)
popd
echo   [OK] 模版已生成

REM ---------- 4. 安装前端依赖 ----------
echo.
echo [5/6] 安装前端依赖 (npm install) ...
where npm >nul 2>&1
if errorlevel 1 (
    echo   [WARN] 找不到 npm，跳过前端依赖安装
    echo          请安装 Node.js 18+: https://nodejs.org/
) else (
    if not exist "%PROJECT_ROOT%\frontend\package.json" (
        echo   [WARN] 找不到 frontend\package.json
        echo          T-FE-A 任务可能尚未完成，跳过 npm install
    ) else (
        pushd "%PROJECT_ROOT%\frontend"
        if not exist "node_modules" (
            call npm install
            if errorlevel 1 (
                echo   [FAIL] npm install 失败，请检查网络或 npm 配置
                popd
                popd
                endlocal
                exit /b 1
            )
        ) else (
            echo   [SKIP] node_modules 已存在
        )
        popd
        echo   [OK] 前端依赖安装完成
    )
)

REM ---------- 5. 探测 WPS ----------
echo.
echo [6/6] 探测 WPS Office (PDF 引擎) ...
where wps >nul 2>&1
if not errorlevel 1 (
    echo   [OK] wps 在 PATH
) else (
    if exist "C:\Program Files\Kingsoft\WPS Office\wps.exe" (
        echo   [OK] 找到: C:\Program Files\Kingsoft\WPS Office\wps.exe
    ) else if exist "C:\Program Files (x86)\Kingsoft\WPS Office\wps.exe" (
        echo   [OK] 找到: C:\Program Files (x86)\Kingsoft\WPS Office\wps.exe
    ) else (
        echo   [WARN] 未找到 WPS Office
        echo          PDF 转码功能将不可用
        echo          安装: https://www.wps.cn/
    )
)

echo.
echo ============================================================
echo   引导完成！
echo   下一步：双击 scripts\start.bat 启动服务
echo ============================================================
echo.

popd
endlocal
exit /b 0
