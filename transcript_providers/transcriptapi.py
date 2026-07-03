"""TranscriptAPI.com transcript provider."""

from __future__ import annotations

import os
import re
import time
from datetime import datetime
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

DURATION_RE = re.compile(r"(?:(\d+):)?(\d+):(\d+)")


def parse_view_count(value: str | None) -> int | None:
    if not value:
        return None

    normalized = value.lower().replace(",", "").strip()
    match = re.search(r"([\d.]+)\s*([km])?", normalized)
    if not match:
        return None

    amount = float(match.group(1))
    suffix = match.group(2)
    if suffix == "k":
        amount *= 1_000
    elif suffix == "m":
        amount *= 1_000_000
    return int(amount)


def parse_duration_seconds(value: str | None) -> int | None:
    if not value:
        return None

    match = DURATION_RE.fullmatch(value.strip())
    if not match:
        return None

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2))
    seconds = int(match.group(3))
    return hours * 3600 + minutes * 60 + seconds


class TranscriptApiProvider(TranscriptProvider):
    name = "transcriptapi"
    base_url = "https://transcriptapi.com/api/v2"

    def __init__(self, api_key: str | None = None, *, use_cache: bool = True) -> None:
        load_env()
        self.api_key = (api_key or os.getenv("TRANSCRIPTAPI_API_KEY", "")).strip()
        if not self.api_key:
            raise TranscriptProviderError("TRANSCRIPTAPI_API_KEY is required in .env")
        self.cache = ApiCache(self.name)
        self.use_cache = use_cache

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    def _fetch_json(self, method: str, path: str, **kwargs: Any) -> dict:
        for attempt in range(4):
            response = requests.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(),
                timeout=120,
                **kwargs,
            )

            if response.status_code in {408, 429, 503}:
                retry_after = response.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else min(30, 2**attempt * 2)
                time.sleep(wait)
                continue

            if response.status_code != 200:
                try:
                    payload = response.json()
                    detail = payload.get("detail")
                    if isinstance(detail, dict):
                        message = detail.get("message") or detail
                    else:
                        message = detail or payload.get("message") or response.text
                except ValueError:
                    message = response.text
                raise TranscriptProviderError(f"HTTP {response.status_code}: {message}")

            return response.json()

        raise TranscriptProviderError("HTTP 429: request failed after retries")

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

    def _channel_latest(self, channel_url: str) -> list[dict]:
        payload = self._request(
            "GET",
            "/youtube/channel/latest",
            params={"channel": channel_url},
        )
        return list(payload.get("results") or [])

    def _channel_videos_page(self, *, channel_url: str | None = None, continuation: str | None = None) -> dict:
        params: dict[str, str] = {}
        if continuation:
            params["continuation"] = continuation
        else:
            params["channel"] = channel_url or ""
        return self._request("GET", "/youtube/channel/videos", params=params)

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
        published_map: dict[str, datetime] = {}

        for item in self._channel_latest(channel_url):
            video_id = item.get("videoId")
            published = parse_iso_datetime(item.get("published"))
            if video_id and published:
                published_map[video_id] = published

        ordered: list[tuple[str, dict]] = []
        seen: set[str] = set()
        continuation: str | None = None

        while len(ordered) < probe_limit:
            payload = self._channel_videos_page(
                channel_url=channel_url if continuation is None else None,
                continuation=continuation,
            )
            results = payload.get("results") or []
            if not results:
                break

            stop = False
            for item in results:
                video_id = item.get("videoId")
                if not video_id or video_id in seen:
                    continue

                metadata = self._merge_video_metadata(item, published_map.get(video_id))
                published = parse_iso_datetime(metadata.get("published"))
                if published and published < cutoff:
                    stop = True
                    break

                ordered.append((video_id, metadata))
                seen.add(video_id)

                if max_videos is not None and len(ordered) >= max_videos:
                    stop = True
                    break
                if len(ordered) >= probe_limit:
                    stop = True
                    break

            if stop:
                break

            if not payload.get("has_more") or not payload.get("continuation_token"):
                break

            continuation = payload["continuation_token"]
            if request_delay > 0:
                time.sleep(request_delay)

        undated_cap = max(int(months * 30), 30)
        filtered: list[tuple[str, dict]] = []
        for index, (video_id, metadata) in enumerate(ordered):
            published = parse_iso_datetime(metadata.get("published"))
            if published is not None:
                if published >= cutoff:
                    filtered.append((video_id, metadata))
                continue

            if index < undated_cap:
                filtered.append((video_id, metadata))

        if max_videos is not None:
            filtered = filtered[:max_videos]

        return filtered

    def _merge_video_metadata(self, item: dict, published: datetime | None = None) -> dict:
        merged = dict(item)
        if published is not None:
            merged["published"] = published.isoformat()
        return merged

    def get_metadata(self, video_id: str) -> dict:
        payload = self._request(
            "GET",
            "/youtube/transcript",
            params={
                "video_url": video_id,
                "format": "text",
                "include_timestamp": "false",
                "send_metadata": "true",
            },
        )
        metadata = payload.get("metadata") or {}
        metadata["video_id"] = payload.get("video_id") or video_id
        metadata["title"] = metadata.get("title") or payload.get("title")
        return metadata

    def get_transcript(self, video_id: str) -> tuple[str, dict]:
        payload = self._request(
            "GET",
            "/youtube/transcript",
            params={
                "video_url": video_id,
                "format": "text",
                "include_timestamp": "false",
                "send_metadata": "false",
            },
        )

        transcript = payload.get("transcript")
        if isinstance(transcript, list):
            lines = [segment.get("text", "").strip() for segment in transcript if segment.get("text")]
            text = plain_text_from_string("\n".join(lines))
        elif isinstance(transcript, str) and transcript.strip():
            text = plain_text_from_string(transcript)
        else:
            raise TranscriptProviderError("empty transcript")

        return text, {
            "language_code": payload.get("language"),
            "available_langs": [payload["language"]] if payload.get("language") else [],
        }

    def metadata_to_index_fields(self, payload: dict) -> dict:
        published = parse_iso_datetime(payload.get("published"))

        return {
            "title": payload.get("title"),
            "view_count": parse_view_count(payload.get("viewCountText")),
            "like_count": None,
            "comment_count": None,
            "upload_date": upload_date_from_datetime(published),
            "duration_seconds": parse_duration_seconds(payload.get("lengthText")),
            "channel": payload.get("channelTitle") or payload.get("author") or payload.get("author_name"),
            "description": payload.get("description"),
        }
