"""PDF 转码：WPS CLI 封装。"""
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from app.config import settings

# WPS 常见安装路径
WPS_PATHS = [
    r"C:\Program Files\Kingsoft\WPS Office\wps.exe",
    r"C:\Program Files (x86)\Kingsoft\WPS Office\wps.exe",
    r"D:\Program Files\Kingsoft\WPS Office\wps.exe",
    r"D:\Program Files (x86)\Kingsoft\WPS Office\wps.exe",
]


def find_wps() -> Optional[str]:
    if settings.WPS_PATH:
        p = Path(settings.WPS_PATH)
        if p.exists():
            return str(p)
    p = shutil.which("wps")
    if p:
        return p
    for cand in WPS_PATHS:
        if Path(cand).exists():
            return str(cand)
    return None


_WPS_CACHE: Optional[str] = None


def get_wps() -> Optional[str]:
    global _WPS_CACHE
    if _WPS_CACHE is None:
        _WPS_CACHE = find_wps()
    return _WPS_CACHE


def convert_to_pdf(src: Path, dst_dir: Path, timeout: int = 120) -> Optional[Path]:
    """调用 WPS 把 src 转成 PDF，输出到 dst_dir。

    Returns: 生成的 PDF 路径，失败返回 None。
    """
    wps = get_wps()
    if not wps:
        return None
    dst_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            [wps, "--convert-to", "pdf", "--output", str(dst_dir), str(src)],
            capture_output=True, text=True, timeout=timeout,
        )
        if result.returncode != 0:
            print(f"[PDF] WPS 转码失败: {result.stderr[:200]}")
            return None
        out = dst_dir / (src.stem + ".pdf")
        if out.exists():
            return out
        return None
    except subprocess.TimeoutExpired:
        print(f"[PDF] WPS 转码超时: {src}")
        return None
    except Exception as e:
        print(f"[PDF] WPS 调用异常: {e}")
        return None
