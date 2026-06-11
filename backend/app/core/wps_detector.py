"""WPS CLI 启动时探测。

启动时调用一次，结果缓存到 settings.WPS_PATH_CACHE，
供 pdf_converter / 健康检查 / 前端 health 端点使用。

WPS 不在 PATH / 不在常见安装路径时，返回 None；不抛异常，
由调用方决定降级策略（仅跟踪原文件，不生成预览 PDF）。
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Optional

# WPS 常见安装路径（Windows）
WPS_PATHS = [
    r"C:\Program Files\Kingsoft\WPS Office\wps.exe",
    r"C:\Program Files (x86)\Kingsoft\WPS Office\wps.exe",
    r"D:\Program Files\Kingsoft\WPS Office\wps.exe",
    r"D:\Program Files (x86)\Kingsoft\WPS Office\wps.exe",
]


def detect_wps() -> Optional[str]:
    """探测 WPS CLI 可执行文件路径。

    Returns: 绝对路径字符串，找不到返回 None。
    """
    # 1) PATH
    p = shutil.which("wps")
    if p:
        return p
    # 2) 常见安装路径
    for cand in WPS_PATHS:
        if Path(cand).exists():
            return str(cand)
    return None


# 模块级缓存（启动时填充）
_wps_path: Optional[str] = None
_wps_detected: bool = False


def init_wps_detector(explicit_path: Optional[str] = None) -> Optional[str]:
    """启动时调用一次，结果缓存。

    Args:
        explicit_path: 配置里指定的 WPS 路径（最高优先级）

    Returns: 探测到的 WPS 路径或 None。
    """
    global _wps_path, _wps_detected
    _wps_detected = True
    if explicit_path and Path(explicit_path).exists():
        _wps_path = explicit_path
        return _wps_path
    _wps_path = detect_wps()
    return _wps_path


def get_wps_path() -> Optional[str]:
    """获取缓存的 WPS 路径。未调用 init_wps_detector 时按需探测。"""
    global _wps_path, _wps_detected
    if not _wps_detected:
        _wps_path = detect_wps()
        _wps_detected = True
    return _wps_path


def reset() -> None:
    """测试用：清空缓存。"""
    global _wps_path, _wps_detected
    _wps_path = None
    _wps_detected = False