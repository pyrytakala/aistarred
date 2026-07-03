"""Supadata transcript provider."""

from __future__ import annotations

import os
import time
from typing import Any

import requests

from api_cache import ApiCache, fetch_cached_json
from transcript_providers.base import (
    TranscriptProvider,
    TranscriptProviderError,
    load_env,
    months_ago,
    parse_iso_datetime,
    plain_text_from_string,
    upload_date_from_datetime,
)


class SupadataProvider(TranscriptProvider):
    name = "supadata"
    base_url = "https://api.supadata.ai/v1"

    def __init__(self, api_key: str | None = None, *, use_cache: bool = True) -> None:
        load_env()
        self.api_key = (api_key or os.getenv("SUPADATA_API_KEY", "")).strip()
        if not self.api_key:
            raise TranscriptProviderError("SUPADATA_API_KEY is required in .env")
        self.cache = ApiCache(self.name)
        self.use_cache = use_cache

    def _fetch_json(self, method: str, path: str, **kwargs: Any) -> dict:
        for attempt in range(6):
            response = requests.request(
                method,
                f"{self.base_url}{path}",
                headers={"x-api-key": self.api_key},
                timeout=60,
                **kwargs,
            )

            if response.status_code == 429:
                wait = min(60, 2**attempt * 5)
                time.sleep(wait)
                continue

            if response.status_code != 200:
                try:
                    payload = response.json()
                    message = payload.get("message") or payload.get("error") or response.text
                except ValueError:
                    message = response.text
                raise TranscriptProviderError(f"HTTP {response.status_code}: {message}")

            return response.json()

        raise TranscriptProviderError("HTTP 429: rate limit exceeded after retries")

    def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        params = kwargs.get("params")
        url = f"{self.base_url}{path}"

        payload, _cache_hit = fetch_cached_json(
            self.cache,
            method=method,
            url=url,
            params=params if isinstance(params, dict) else None,
            fetcher=lambda: self._fetch_json(method, path, **kwargs),
            enabled=self.use_cache,
        )
        return payload

    def list_channel_videos(
        self,
        channel_url: str,
        limit: int,
        video_type: str = "video",
    ) -> list[str]:
        payload = self._request(
            "GET",
            "/youtube/channel/videos",
            params={"id": channel_url, "type": video_type, "limit": limit},
        )
        return list(payload.get("videoIds") or [])[:limit]

    def list_channel_videos_since(
        self,
        channel_url: str,
        *,
        months: float = 2,
        probe_limit: int = 500,
        max_videos: int | None = None,
        request_delay: float = 1.0,
    ) -> list[tuple[str, dict]]:
        cutoff = months_ago(months)
        candidate_ids = self.list_channel_videos(channel_url, probe_limit)

        recent: list[tuple[str, dict]] = []
        for index, video_id in enumerate(candidate_ids):
            metadata = self.get_metadata(video_id)
            published = parse_iso_datetime(metadata.get("createdAt"))
            if published is None or published < cutoff:
                break

            recent.append((video_id, metadata))
            if max_videos is not None and len(recent) >= max_videos:
                break
            if request_delay > 0 and index < len(candidate_ids) - 1:
                time.sleep(request_delay)

        return recent

    def get_metadata(self, video_id: str) -> dict:
        url = f"https://www.youtube.com/watch?v={video_id}"
        return self._request("GET", "/metadata", params={"url": url})

    def get_transcript(self, video_id: str) -> tuple[str, dict]:
        url = f"https://www.youtube.com/watch?v={video_id}"
        payload = self._request(
            "GET",
            "/transcript",
            params={"url": url, "text": "false", "mode": "native", "lang": "en"},
        )

        content = payload.get("content")
        if isinstance(content, list):
            lines = [chunk.get("text", "").strip() for chunk in content if chunk.get("text")]
            text = plain_text_from_string("\n".join(lines))
        elif isinstance(content, str) and content.strip():
            text = plain_text_from_string(content)
        else:
            raise TranscriptProviderError("empty transcript")

        return text, {
            "language_code": payload.get("lang"),
            "available_langs": payload.get("availableLangs") or [],
        }

    def metadata_to_index_fields(self, payload: dict) -> dict:
        stats = payload.get("stats") or {}
        media = payload.get("media") or {}
        author = payload.get("author") or {}
        published = parse_iso_datetime(payload.get("createdAt"))

        return {
            "title": payload.get("title"),
            "view_count": stats.get("views"),
            "like_count": stats.get("likes"),
            "comment_count": stats.get("comments"),
            "upload_date": upload_date_from_datetime(published),
            "duration_seconds": media.get("duration"),
            "channel": author.get("displayName"),
            "description": payload.get("description"),
        }
