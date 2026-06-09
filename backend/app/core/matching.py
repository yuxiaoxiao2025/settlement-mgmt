"""文件名模糊匹配。"""
import re
from difflib import SequenceMatcher
from typing import List, Dict, Optional


def normalize(name: str) -> str:
    """归一化：去扩展名、去空白、转小写。"""
    base = re.sub(r'\.[a-zA-Z0-9]+$', '', name)
    base = re.sub(r'[\s_\-\(\)（）：:、，。.]+', '', base)
    return base.lower()


def score(filename: str, item_name: str) -> float:
    """计算文件名与项名的相似度。

    1. 包含关系：文件名归一化后包含项名归一化 → 0.9
    2. 反向包含：项名包含文件名 → 0.85
    3. 字符相似度（difflib）→ [0, 1]
    取最高。
    """
    nf = normalize(filename)
    ni = normalize(item_name)
    if not nf or not ni:
        return 0.0
    if ni in nf:
        return 0.9
    if nf in ni:
        return 0.85
    return SequenceMatcher(None, nf, ni).ratio()


def match_best(
    filename: str,
    items: List[Dict],
    threshold: float = 0.5,
) -> Optional[Dict]:
    """在 items 中找最佳匹配项。

    items: [{seq, name, ...}, ...]
    返回最佳匹配项或 None。
    """
    if not items:
        return None
    scored = [(score(filename, it["name"]), it) for it in items]
    scored.sort(key=lambda x: x[0], reverse=True)
    best, item = scored[0]
    if best >= threshold:
        return item
    return None
