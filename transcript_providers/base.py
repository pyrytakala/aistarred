"""Shared types and helpers for transcript providers."""

from __future__ import annotations

import calendar
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path


class TranscriptProviderError(Exception):
    pass


def load_env() -> None:
    env_path = Path(".env")
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


def months_ago(months: float, *, now: datetime | None = None) -> datetime:
    whole_months = int(months)
    now = now or datetime.now(timezone.utc)
    month = now.month - whole_months
    year = now.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    day = min(now.day, calendar.monthrange(year, month)[1])
    cutoff = datetime(year, month, day, tzinfo=timezone.utc)

    extra_days = int(round((months - whole_months) * 30))
    if extra_days:
        cutoff = cutoff.replace(day=max(1, cutoff.day - extra_days))

    return cutoff


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def plain_text_from_string(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines) + ("\n" if lines else "")


def upload_date_from_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).strftime("%Y%m%d")


class TranscriptProvider(ABC):
    name: str

    @abstractmethod
    def list_channel_videos_since(
        self,
        channel_url: str,
        *,
        months: float = 2,
        probe_limit: int = 500,
        max_videos: int | None = None,
        request_delay: float = 1.0,
    ) -> list[tuple[str, dict]]:
        """Return (video_id, provider_metadata) pairs, newest first."""

    @abstractmethod
    def get_metadata(self, video_id: str) -> dict:
        raise NotImplementedError

    @abstractmethod
    def get_transcript(self, video_id: str) -> tuple[str, dict]:
        raise NotImplementedError

    @abstractmethod
    def metadata_to_index_fields(self, payload: dict) -> dict:
        raise NotImplementedError
