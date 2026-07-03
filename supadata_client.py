"""Backward-compatible shim around the transcript provider layer."""

from __future__ import annotations

from transcript_providers import TranscriptProviderError, load_env
from transcript_providers.base import (
    months_ago,
    parse_iso_datetime,
    plain_text_from_string,
    upload_date_from_datetime,
)
from transcript_providers.supadata import SupadataProvider

SupadataError = TranscriptProviderError
SupadataClient = SupadataProvider

parse_created_at = parse_iso_datetime


def metadata_to_index_fields(payload: dict) -> dict:
    return SupadataProvider().metadata_to_index_fields(payload)


__all__ = [
    "SupadataClient",
    "SupadataError",
    "load_env",
    "metadata_to_index_fields",
    "months_ago",
    "parse_created_at",
    "plain_text_from_string",
]
