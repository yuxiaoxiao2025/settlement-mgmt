"""文件监听服务（watchdog + APScheduler 兜底轮询）。

主路径：watchdog Observer（实时事件）
兜底：当 watchdog 启动失败或不可用时，APScheduler 每 WATCHDOG_FALLBACK_POLL 秒
扫描一次 PROJECTS_DIR，触发与 watchdog 一致的回调。
"""
from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Callable, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from app.config import settings


# 项目下所有文件的「最后已知 mtime」快照（兜底轮询比对）
_known_files: dict[str, float] = {}
_snapshot_lock = threading.Lock()


def _scan_projects_dir() -> list[tuple[str, str, Path]]:
    """扫描 PROJECTS_DIR，返回 [(event_type, kind, path), ...]。

    与 watchdog 事件格式对齐：created / modified / deleted。

    跳过的目录（修 I-files，REVIEW-TRACK2 I2 / REVIEW-TRACK3 I-files）：
    - `.pdfs/`     : WPS 转码产物，避免自循环 ingest
    - `_unclaimed/`: 用户未归类的临时存放区
    - `.tmp/`      : 任何临时文件
    """
    events: list[tuple[str, str, Path]] = []
    root = settings.PROJECTS_DIR
    if not root.exists():
        return events

    SKIP_DIRS = {".pdfs", "_unclaimed", ".tmp"}
    current: dict[str, float] = {}
    # 递归扫描所有文件
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        # 跳过 meta 文件
        if p.name == "meta.json":
            continue
        # 跳过 SKIP_DIRS 内的文件（避免自循环 + 临时产物触发 ingest）
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        try:
            mtime = p.stat().st_mtime
        except OSError:
            continue
        key = str(p.resolve())
        current[key] = mtime

    with _snapshot_lock:
        # 删除事件
        for old_key in _known_files:
            if old_key not in current:
                events.append(("deleted", "file", Path(old_key)))
        # 新增 / 修改事件
        for key, mtime in current.items():
            if key not in _known_files:
                events.append(("created", "file", Path(key)))
            elif _known_files[key] != mtime:
                events.append(("modified", "file", Path(key)))
        _known_files.clear()
        _known_files.update(current)

    return events


class _Handler(FileSystemEventHandler):
    """watchdog 事件 handler（trailing-edge debounce）。"""

    def __init__(self, callback: Callable[[str, str, Path], None]):
        self._cb = callback
        # path → Timer（每次新事件取消旧 Timer，重置 2s）
        self._timers: dict[str, threading.Timer] = {}
        self._lock = threading.Lock()

    def _emit(self, event_type: str, path: str):
        """trailing-edge debounce：每次新事件重置 2s 计时器。

        - 编辑器连续保存（间隔 < 2s）会被合并成 1 次回调（最后一次事件）
        - 距上次 emit > 2s 时立即触发
        """
        p = Path(path)

        def fire():
            with self._lock:
                # 清理已触发的 timer 引用
                self._timers.pop(path, None)
            try:
                self._cb(event_type, "file", p)
            except Exception as e:
                print(f"[WATCHER] 回调异常: {e}")

        with self._lock:
            old = self._timers.pop(path, None)
            if old is not None:
                old.cancel()
            timer = threading.Timer(settings.DEBOUNCE_SECONDS, fire)
            self._timers[path] = timer
            timer.start()

    def on_created(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("created", event.src_path)

    def on_modified(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("modified", event.src_path)

    def on_moved(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("deleted", event.src_path)
            self._emit("created", event.dest_path)

    def on_deleted(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("deleted", event.src_path)


class WatcherService:
    """watchdog + APScheduler 兜底轮询。"""

    def __init__(self, callback: Callable[[str, str, Path], None]):
        self._callback = callback
        self._observer: Optional[Observer] = None
        self._scheduler: Optional[BackgroundScheduler] = None
        self._available = True
        self._mode: str = "uninitialized"  # watchdog / polling / stopped

    def start(self):
        if self._observer or self._scheduler:
            return
        # 先初始化已知文件快照（避免启动时把所有现存文件当成 created）
        _scan_projects_dir()

        # 尝试 watchdog
        try:
            self._observer = Observer()
            handler = _Handler(self._callback)
            self._observer.schedule(handler, str(settings.PROJECTS_DIR), recursive=True)
            self._observer.start()
            self._mode = "watchdog"
            # 同步启动 APScheduler 兜底（低频，作为 watchdog 失效时的补偿）
            self._start_polling_fallback()
            return
        except Exception as e:
            print(f"[WARN] 文件监听启动失败: {e}")
            self._observer = None
            self._available = False

        # watchdog 不可用 → 纯轮询
        self._start_polling_fallback(force=True)
        self._mode = "polling"

    def _start_polling_fallback(self, force: bool = False):
        """启动 APScheduler 兜底轮询。"""
        if self._scheduler:
            return
        try:
            self._scheduler = BackgroundScheduler(daemon=True)
            self._scheduler.add_job(
                self._poll_once,
                "interval",
                seconds=settings.WATCHDOG_FALLBACK_POLL,
                id="watchdog_fallback_poll",
                replace_existing=True,
            )
            self._scheduler.start()
            if force:
                print(f"[WARN] 已启用 APScheduler 兜底轮询（每 {settings.WATCHDOG_FALLBACK_POLL}s）")
        except Exception as e:
            print(f"[WARN] APScheduler 兜底轮询启动失败: {e}")
            self._scheduler = None

    def _poll_once(self):
        """单次轮询：扫描文件变更并触发回调。"""
        try:
            for event_type, kind, path in _scan_projects_dir():
                self._callback(event_type, kind, path)
        except Exception as e:
            print(f"[WATCHER] 轮询异常: {e}")

    def stop(self):
        if self._observer:
            try:
                self._observer.stop()
                self._observer.join()
            except Exception:
                pass
            self._observer = None
        if self._scheduler:
            try:
                self._scheduler.shutdown(wait=False)
            except Exception:
                pass
            self._scheduler = None
        self._mode = "stopped"

    @property
    def is_available(self) -> bool:
        return self._observer is not None or self._scheduler is not None

    @property
    def mode(self) -> str:
        return self._mode