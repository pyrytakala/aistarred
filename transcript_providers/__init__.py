"""Transcript provider factory."""

from __future__ import annotations

import os

from transcript_providers.base import TranscriptProvider, TranscriptProviderError, load_env
from transcript_providers.supadata import SupadataProvider
from transcript_providers.transcriptapi import TranscriptApiProvider

PROVIDERS: dict[str, type[TranscriptProvider]] = {
    SupadataProvider.name: SupadataProvider,
    TranscriptApiProvider.name: TranscriptApiProvider,
}


def default_provider_name() -> str:
    load_env()
    configured = os.getenv("TRANSCRIPT_PROVIDER", "").strip().lower()
    if configured:
        return configured
    if os.getenv("TRANSCRIPTAPI_API_KEY", "").strip():
        return TranscriptApiProvider.name
    if os.getenv("SUPADATA_API_KEY", "").strip():
        return SupadataProvider.name
    return TranscriptApiProvider.name


def get_provider(name: str | None = None, *, use_cache: bool = True) -> TranscriptProvider:
    provider_name = (name or default_provider_name()).strip().lower()
    provider_cls = PROVIDERS.get(provider_name)
    if provider_cls is None:
        supported = ", ".join(sorted(PROVIDERS))
        raise TranscriptProviderError(
            f"Unknown transcript provider '{provider_name}'. Supported: {supported}"
        )
    return provider_cls(use_cache=use_cache)


__all__ = [
    "TranscriptProvider",
    "TranscriptProviderError",
    "get_provider",
    "default_provider_name",
    "load_env",
]
