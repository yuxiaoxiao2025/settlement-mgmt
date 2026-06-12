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
from pathlib import Path

# 设置 env 避免 config 加载阶段触发 lifespan 校验
import os
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin123")
os.environ.setdefault("SITE_VERIFICATION_CODE", "jrvUPovFZS8")
os.environ.setdefault("JWT_SECRET", "x" * 64)

from app.config import settings  # noqa: E402
from app.services.file_service import _to_relative_path, _project_id_from_path  # noqa: E402
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
            # 没 item_id 的 orphan 走绝对路径（不动）
            if not f.item_id:
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
