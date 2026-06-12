"""一次性数据迁移：files.original_path 绝对路径 → 项目相对路径。

修 B-03：跨平台移植（Windows venv → Docker）后历史 DB 数据是绝对路径
（E:\\...\\projects\\{proj_id}\\01_xxx\\foo.pdf），容器内失效。
本脚本把 DB 里的原始绝对路径改为项目内相对路径
（如 01_xxx/foo.pdf），与 T-06 ingest 写库形态一致。

用法：
  cd backend && python -m scripts.migrate_absolute_paths [--dry-run]
  
默认 dry-run（只打印不改库）。传 --apply 真正改库。
"""
import argparse
from pathlib import Path, PureWindowsPath, PurePosixPath


def _looks_absolute(p: str) -> bool:
    """判断路径是否绝对 — 跨平台兼容。

    Windows 上 Path('/projects/...').is_absolute() = False（Windows 把 /projects 当相对），
    但 Linux 容器内 /projects/... 是绝对路径。需要双重判断。
    """
    pp = Path(p)
    if pp.is_absolute():
        return True
    # POSIX 风格: 以 / 开头
    if p.startswith("/"):
        return True
    # Windows 风格: 盘符开头 C:\ 或 C:/
    if len(p) >= 2 and p[1] == ":":
        return True
    return False




# 设置 env 避免 config 加载阶段触发 lifespan 校验
import os
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")
os.environ.setdefault("SITE_VERIFICATION_CODE", "jrvUPovFZS8")
os.environ.setdefault("JWT_SECRET", "x" * 64)

from app.config import settings  # noqa: E402
from app.services.file_service import _to_relative_path  # noqa: E402
from app.core.paths import project_id_from_path  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import File, Item  # noqa: E402


def migrate(dry_run: bool = True) -> tuple[int, int]:
    """返回 (changed_count, total_count)。"""
    changed = 0
    total = 0
    with SessionLocal() as db:
        files = db.query(File).all()
        for f in files:
            total += 1
            # 没 item_id 的 orphan — 走原路径不动（or 修 I-4 补 project_id）
            if not f.item_id:
                # 修 I-4：补 project_id 到 item_id_orphan 列（如果还没填）
                if not f.item_id_orphan:
                    # 推断：从 original_path 绝对路径或文件位置找
                    # 修实测 BUG：Path('/projects/...').is_absolute() 在 Windows 上是 False
                    # 但这是 Linux 容器内的绝对路径（watcher 写入），用 _looks_absolute 跨平台判断
                    if _looks_absolute(f.original_path):
                        proj_id = project_id_from_path(Path(f.original_path), settings.PROJECTS_DIR)
                    else:
                        # 已相对路径 — 不能可靠推断（reviewer Round 3 警告过）
                        # 跳过，让用户手动归档
                        continue
                    if proj_id:
                        if changed < 20:
                            print(f"  {f.id[:8]} {f.filename[:30]} (orphan): → project_id={proj_id}")
                        if not dry_run:
                            f.item_id_orphan = proj_id
                        changed += 1
                continue
            # 修 C-3：已项目相对路径不处理（T-06 写入的形态）— _to_relative_path 对已相对路径
            # 会兜底返回 basename（丢子目录），保护策略：直接跳过
            if not _looks_absolute(f.original_path):
                continue
            item = db.query(Item).filter(Item.id == f.item_id).first()
            if not item:
                continue
            # 用 item.project_id 推断
            new_path = _to_relative_path(item.project_id, Path(f.original_path))
            if new_path != f.original_path and not Path(new_path).is_absolute():
                if changed < 20:  # 限制打印数量
                    print(f"  {f.id[:8]} {f.filename[:30]}: {f.original_path[:50]}... → {new_path}")
                if not dry_run:
                    f.original_path = new_path
                changed += 1
        if not dry_run:
            db.commit()
    return changed, total


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", dest="dry_run", action="store_false")
    args = parser.parse_args()
    print(f"[{'DRY-RUN' if args.dry_run else 'APPLY'}] 迁移 files.original_path 绝对路径 → 项目相对")
    changed, total = migrate(dry_run=args.dry_run)
    print(f"\n完成：{changed}/{total} 行{'将' if args.dry_run else '已'}改  {'(没改库)' if args.dry_run else '(已 commit)'}")
