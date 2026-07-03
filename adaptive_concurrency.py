"""Adaptive concurrency limiter for parallel API workloads."""

from __future__ import annotations

import threading
import time


class AdaptiveConcurrency:
    def __init__(
        self,
        *,
        initial: int = 4,
        minimum: int = 1,
        maximum: int = 8,
    ) -> None:
        self.minimum = minimum
        self.maximum = maximum
        self._capacity = max(minimum, min(initial, maximum))
        self._in_flight = 0
        self._pause_until = 0.0
        self._cond = threading.Condition()

    @property
    def capacity(self) -> int:
        with self._cond:
            return self._capacity

    def acquire(self) -> None:
        with self._cond:
            while True:
                now = time.monotonic()
                if now < self._pause_until:
                    self._cond.wait(timeout=min(1.0, self._pause_until - now))
                    continue
                if self._in_flight < self._capacity:
                    self._in_flight += 1
                    return
                self._cond.wait(timeout=0.1)

    def release(self) -> None:
        with self._cond:
            self._in_flight = max(0, self._in_flight - 1)
            self._cond.notify_all()

    def penalize(self, *, retry_after: float | None = None) -> None:
        with self._cond:
            self._capacity = max(self.minimum, max(1, self._capacity // 2))
            pause = retry_after if retry_after is not None else 2.0
            self._pause_until = max(self._pause_until, time.monotonic() + pause)
            self._cond.notify_all()

    def reward(self) -> None:
        with self._cond:
            if self._capacity < self.maximum:
                self._capacity += 1
            self._cond.notify_all()
