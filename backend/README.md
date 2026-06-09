# 项目结算资料管理系统 — 后端

## 快速开始

```bash
# 创建虚拟环境
python -m venv .venv
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 一次性：解析 docx 模版 → master_template.json
python scripts/bootstrap_template.py

# 探测 WPS CLI
python scripts/check_wps.py

# 启动开发服务器
python -m app.main
# 或：uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 目录

- `app/` — FastAPI 应用
- `scripts/` — 一次性脚本
- `tests/` — pytest
