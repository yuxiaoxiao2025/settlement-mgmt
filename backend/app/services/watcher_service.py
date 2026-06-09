"""文件监听服务（watchdog）。"""
import threading
import time
from pathlib import Path
from typing import Callable, Optional

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from app.config import settings


class _Handler(FileSystemEventHandler):
    def __init__(self, callback: Callable[[str, str, Path], None]):
        self._cb = callback
        self._debounce: dict[str, float] = {}

    def _emit(self, event_type: str, path: str):
        # 去抖：同路径 2 秒内多次事件只处理最后一次
        now = time.time()
        last = self._debounce.get(path, 0)
        if now - last < settings.DEBOUNCE_SECONDS:
            self._debounce[path] = now
            return
        self._debounce[path] = now
        # 延迟一点再发，确保文件写入完成
        threading.Timer(
            settings.DEBOUNCE_SECONDS,
            self._cb,
            args=(event_type, "file", Path(path)),
        ).start()

    def on_created(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("created", event.src_path)

    def on_modified(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("modified", event.src_path)

    def on_moved(self, event: FileSystemEvent):
        if not event.is_directory:
            # 旧路径当删除，新路径当创建
            self._emit("deleted", event.src_path)
            self._emit("created", event.dest_path)

    def on_deleted(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("deleted", event.src_path)


class WatcherService:
    """watchdog observer 封装。"""

    def __init__(self, callback: Callable[[str, str, Path], None]):
        self._callback = callback
        self._observer: Optional[Observer] = None
        self._available = True

    def start(self):
        if self._observer:
            return
        try:
            self._observer = Observer()
            handler = _Handler(self._callback)
            self._observer.schedule(handler, str(settings.PROJECTS_DIR), recursive=True)
            self._observer.start()
        except Exception as e:
            print(f"[WARN] 文件监听启动失败: {e}")
            print(f"[WARN] 已回退到手动刷新模式")
            self._available = False
            self._observer = None

    def stop(self):
        if self._observer:
            self._observer.stop()
            self._observer.join()
            self._observer = None

    @property
    def is_available(self) -> bool:
        return self._observer is not None
