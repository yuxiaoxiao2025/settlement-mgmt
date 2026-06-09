"""解析 项目结算资料交接清单.docx 模版。"""
import re
from pathlib import Path
from typing import List, Dict

from docx import Document


def _sanitize_name(name: str) -> str:
    """生成安全的文件夹名（去除 Windows 非法字符 + 限制长度）。"""
    # 替换非法字符
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)
    # 去除括号说明（保留主名）
    name = re.sub(r'（[^）]*）', '', name)
    name = re.sub(r'\([^)]*\)', '', name)
    # 截断
    return name.strip()[:50] or 'unnamed'


def load_template_from_docx(path: Path) -> List[Dict]:
    """解析 docx 中的资料项表格。

    返回: [{seq, name, description, is_default: True, folder_name}, ...]
    """
    doc = Document(str(path))
    items: List[Dict] = []
    seq = 0

    for tbl in doc.tables:
        for row in tbl.rows:
            cells = [cell.text.strip() for cell in row.cells]
            if len(cells) < 3:
                continue
            # 跳过表头
            if cells[0] in ("序号", "") or cells[1] in ("资料名称", ""):
                continue
            # 跳过非数字序号
            if not cells[0].isdigit():
                continue
            seq = int(cells[0])
            name = cells[1]
            # 描述可能跨多个 cell（合并），拼接
            desc = ' '.join(c for c in cells[2:] if c).strip()
            if not name:
                continue
            items.append({
                "seq": seq,
                "name": name,
                "description": desc or None,
                "is_default": True,
                "folder_name": _sanitize_name(name),
            })

    # 按 seq 排序
    items.sort(key=lambda x: x["seq"])
    return items


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python template_loader.py <path-to-docx>")
        sys.exit(1)
    items = load_template_from_docx(Path(sys.argv[1]))
    for it in items:
        print(f"{it['seq']:02d}. {it['name']}  →  {it['folder_name']}")
