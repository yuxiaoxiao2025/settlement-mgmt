"""PDF 转码：WPS CLI 封装。

调用方：
- services/file_service.ingest_path() — 文件入库时尝试转码
- core/wps_detector — 启动时探测

如果 WPS 不可用，转码降级为 noop：原文件仍入库，is_pdf=False，
pdf_path=None，由 UI 提示「请直接打开原文件」。
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from app.core.wps_detector import get_wps_path


def convert_to_pdf(
    src: Path,
    dst_dir: Path,
    timeout: int = 120,
) -> Optional[Path]:
    """调用 WPS 把 src 转成 PDF，输出到 dst_dir。

    Returns: 生成的 PDF 路径，失败返回 None（WPS 不可用 / 转码失败 / 超时）。
    """
    wps = get_wps_path()
    if not wps:
        return None
    if not src.exists():
        return None
    dst_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            [wps, "--convert-to", "pdf", "--output", str(dst_dir), str(src)],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            print(f"[PDF] WPS 转码失败 ({src.name}): {result.stderr[:200]}")
            return None
        out = dst_dir / (src.stem + ".pdf")
        if out.exists():
            return out
        print(f"[PDF] WPS 退出 0 但未生成 {out}")
        return None
    except subprocess.TimeoutExpired:
        print(f"[PDF] WPS 转码超时 ({timeout}s): {src.name}")
        return None
    except Exception as e:
        print(f"[PDF] WPS 调用异常 ({src.name}): {e}")
        return None