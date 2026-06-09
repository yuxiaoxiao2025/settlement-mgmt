"""探测 WPS CLI 路径。"""
import shutil
import subprocess
import sys
from pathlib import Path

# WPS 常见安装路径
WPS_PATHS = [
    r"C:\Program Files\Kingsoft\WPS Office\wps.exe",
    r"C:\Program Files (x86)\Kingsoft\WPS Office\wps.exe",
    r"D:\Program Files\Kingsoft\WPS Office\wps.exe",
    r"D:\Program Files (x86)\Kingsoft\WPS Office\wps.exe",
]


def find_wps() -> str | None:
    """探测 WPS CLI 路径。"""
    # 1) PATH
    p = shutil.which("wps")
    if p:
        return p
    # 2) 常见安装路径
    for candidate in WPS_PATHS:
        if Path(candidate).exists():
            return candidate
    return None


def test_convert(wps_path: str, src: Path, dst_dir: Path) -> bool:
    """测试一次转换（用项目里的 .docx 模版）。"""
    try:
        result = subprocess.run(
            [wps_path, "--convert-to", "pdf", "--output", str(dst_dir), str(src)],
            capture_output=True, text=True, timeout=60,
        )
        return result.returncode == 0
    except Exception as e:
        print(f"  [ERR] {e}")
        return False


def main():
    print("=" * 60)
    print("WPS CLI 探测")
    print("=" * 60)
    wps = find_wps()
    if not wps:
        print("[FAIL] 未找到 WPS Office")
        print("请安装 WPS Office 或把 wps.exe 加入 PATH")
        sys.exit(1)
    print(f"[OK] 找到: {wps}")

    # 测试一次转换
    src = Path("../项目结算资料交接清单.docx").resolve()
    if not src.exists():
        print(f"[WARN] 跳过测试：{src} 不存在")
        return

    dst = Path("./_test_wps")
    dst.mkdir(exist_ok=True)
    print(f"[TEST] 测试转换: {src.name} → {dst}")
    if test_convert(wps, src, dst):
        pdf = dst / (src.stem + ".pdf")
        if pdf.exists():
            print(f"[OK] 测试成功: {pdf} ({pdf.stat().st_size} bytes)")
        else:
            print(f"[WARN] 返回码 0 但 PDF 不存在: {dst}")
    else:
        print("[FAIL] 测试转换失败")


if __name__ == "__main__":
    main()
