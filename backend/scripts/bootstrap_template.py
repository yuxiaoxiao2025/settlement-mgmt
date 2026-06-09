"""Bootstrap: 解析 项目结算资料交接清单.docx → data/master_template.json

只跑一次，或当模版更新时跑。
"""
import json
import re
import sys
from pathlib import Path

# 允许从 backend/ 目录直接运行
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings
from app.core.template_loader import load_template_from_docx  # noqa: E402


def main():
    docx_path = ROOT / "项目结算资料交接清单.docx"
    if not docx_path.exists():
        # 兼容从仓库根目录运行
        docx_path = ROOT.parent / "项目结算资料交接清单.docx"

    if not docx_path.exists():
        print(f"[FAIL] 找不到源 docx: {docx_path}")
        sys.exit(1)

    print(f"[INFO] 解析模版: {docx_path}")
    items = load_template_from_docx(docx_path)
    print(f"[INFO] 解析到 {len(items)} 项标准资料")

    if len(items) < 25:
        print(f"[WARN] 期望 25 项，实际 {len(items)} 项，请检查模版")

    out = {
        "version": 1,
        "source": str(docx_path.name),
        "items": items,
    }

    target = settings.TEMPLATE_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[OK] 写入 {target}")

    # 打印前 3 项 + 最后 1 项做样例
    for it in items[:3]:
        print(f"  {it['seq']:02d}. {it['name']}  —  {it.get('description') or ''}")
    print(f"  ... 共 {len(items)} 项")


if __name__ == "__main__":
    main()
