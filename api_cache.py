"""Persistent on-disk cache for paid API responses."""

from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path
from typing import Any, Callable

DEFAULT_CACHE_DIR = Path(".cache/api")


def cache_enabled() -> bool:
    value = os.getenv("API_CACHE", "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


class ApiCache:
    def __init__(self, namespace: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> None:
        self.namespace = namespace
        self.cache_dir = cache_dir / namespace
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def make_key(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
    ) -> str:
        parts = [self.namespace, method.upper(), url]
        if params:
            parts.append(json.dumps(params, sort_keys=True, default=str))
        if body:
            parts.append(json.dumps(body, sort_keys=True, default=str))
        return "|".join(parts)

    def _path_for_key(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.json"

    def get(self, key: str) -> Any | None:
        path = self._path_for_key(key)
        if not path.exists():
            return None

        with self._lock:
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return None

        if payload.get("key") != key:
            return None
        return payload.get("data")

    def set(self, key: str, data: Any) -> None:
        path = self._path_for_key(key)
        with self._lock:
            path.write_text(
                json.dumps({"key": key, "data": data}, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )


def fetch_cached_json(
    cache: ApiCache,
    *,
    method: str,
    url: str,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    fetcher: Callable[[], dict[str, Any]],
    enabled: bool | None = None,
) -> tuple[dict[str, Any], bool]:
    """Return (payload, cache_hit)."""
    use_cache = cache_enabled() if enabled is None else enabled
    key = cache.make_key(method, url, params=params, body=body)

    if use_cache:
        cached = cache.get(key)
        if cached is not None:
            return cached, True

    payload = fetcher()
    if use_cache:
        cache.set(key, payload)
    return payload, False


def fetch_cached_text(
    cache: ApiCache,
    *,
    key: str,
    fetcher: Callable[[], str],
    enabled: bool | None = None,
) -> tuple[str, bool]:
    use_cache = cache_enabled() if enabled is None else enabled

    if use_cache:
        cached = cache.get(key)
        if isinstance(cached, str):
            return cached, True

    payload = fetcher()
    if use_cache:
        cache.set(key, payload)
    return payload, False
