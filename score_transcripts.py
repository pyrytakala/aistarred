#!/usr/bin/env python3
"""Score conference talk transcripts using Fireworks and rank by quality."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

from adaptive_concurrency import AdaptiveConcurrency
from api_cache import ApiCache, fetch_cached_text
from supadata_client import load_env
from dimension_tags import dimension_tags
from ranking_adjustments import apply_like_rank_adjustment, index_videos_by_id


DEFAULT_INDEX_PATH = Path("transcripts/index.json")
DEFAULT_PROMPT_PATH = Path("scoring_prompt.txt")
DEFAULT_OUTPUT_DIR = Path("scores")
DEFAULT_MODEL = "accounts/fireworks/models/deepseek-v4-flash"
DEFAULT_WORKERS = 4
FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions"
MAX_SCORE_RETRIES = 5

SUMMARY_BULLETS_SECTION_RE = re.compile(
    r"^-\s*(?:\*\*)?Summary bullets:(?:\*\*)?\s*\n(.*?)(?=\n-\s*(?:\*\*)?Central claim)",
    re.IGNORECASE | re.DOTALL | re.MULTILINE,
)
SUMMARY_BULLET_LINE_RE = re.compile(r"^\s*-\s+(.+)$", re.MULTILINE)
COMPOSITE_LINE_RE = re.compile(r"^-\s*(?:\*\*)?COMPOSITE", re.MULTILINE | re.IGNORECASE)
COMPOSITE_SCORE_RE = re.compile(r"([\d.]+)\s*/\s*100")
CONFIDENCE_RE = re.compile(r"Confidence:\s*(?:\*\*)?(High|Med|Low)", re.IGNORECASE)
DIMENSION_RES = {
    "substance": re.compile(
        r"^-\s*(?:\*\*)?Substance:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "evidence": re.compile(
        r"^-\s*(?:\*\*)?Evidence:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "specificity": re.compile(
        r"^-\s*(?:\*\*)?Specificity:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "insight_density": re.compile(
        r"^-\s*(?:\*\*)?Insight density:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    "non_promotion": re.compile(
        r"^-\s*(?:\*\*)?Non-promotion:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$",
        re.IGNORECASE | re.MULTILINE,
    ),
}


class RateLimitError(RuntimeError):
    def __init__(self, message: str, *, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


_print_lock = threading.Lock()


def log(message: str) -> None:
    with _print_lock:
        print(message, flush=True)


def extract_speakers(title: str, description: str | None = None) -> str:
    if " - " in title:
        return title.rsplit(" - ", 1)[1].strip()
    if description:
        speakers_match = re.search(r"Speakers?:\s*\n(?:-\s*(.+?)(?:\n|$))+", description, re.IGNORECASE)
        if speakers_match:
            names = re.findall(r"-\s*(.+?)(?:\n|$)", description)
            if names:
                return "; ".join(name.strip() for name in names[:3])
    return "Unknown"


def load_prompt_template(path: Path) -> str:
    return path.read_text()


def build_prompt(template: str, title: str, speakers: str, transcript: str) -> str:
    return (
        template.replace("{title}", title)
        .replace("{speakers}", speakers)
        .replace("{transcript}", transcript)
    )


def fireworks_cache_key(model: str, prompt: str) -> str:
    digest = hashlib.sha256(f"{model}\n{prompt}".encode("utf-8")).hexdigest()
    return f"fireworks|{model}|{digest}"


def fetch_fireworks_completion(
    api_key: str,
    model: str,
    prompt: str,
    *,
    max_tokens: int = 4096,
    temperature: float = 0.2,
) -> requests.Response:
    return requests.post(
        FIREWORKS_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
        timeout=300,
    )


def score_transcript(
    api_key: str,
    model: str,
    prompt: str,
    *,
    cache: ApiCache,
    use_cache: bool = True,
    max_tokens: int = 4096,
    temperature: float = 0.2,
) -> tuple[str, bool]:
    cache_key = fireworks_cache_key(model, prompt)

    def fetcher() -> str:
        response = fetch_fireworks_completion(
            api_key,
            model,
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if response.status_code in {408, 429, 503}:
            retry_after = response.headers.get("Retry-After")
            raise RateLimitError(
                f"Fireworks HTTP {response.status_code}: {response.text}",
                retry_after=float(retry_after) if retry_after else None,
            )
        if response.status_code != 200:
            raise RuntimeError(f"Fireworks HTTP {response.status_code}: {response.text}")

        payload = response.json()
        return payload["choices"][0]["message"]["content"]

    return fetch_cached_text(
        cache,
        key=cache_key,
        fetcher=fetcher,
        enabled=use_cache,
    )


def score_transcript_with_retries(
    api_key: str,
    model: str,
    prompt: str,
    *,
    cache: ApiCache,
    concurrency: AdaptiveConcurrency,
    use_cache: bool = True,
) -> tuple[str, bool]:
    for attempt in range(MAX_SCORE_RETRIES):
        concurrency.acquire()
        try:
            text, cache_hit = score_transcript(
                api_key,
                model,
                prompt,
                cache=cache,
                use_cache=use_cache,
            )
            if not cache_hit:
                concurrency.reward()
            return text, cache_hit
        except RateLimitError as exc:
            concurrency.penalize(retry_after=exc.retry_after)
            log(
                f"  -> rate limited (attempt {attempt + 1}/{MAX_SCORE_RETRIES}); "
                f"reducing parallelism to {concurrency.capacity}"
            )
        finally:
            concurrency.release()

    raise RateLimitError("Fireworks rate limit persisted after retries")


def extract_summary_bullets(text: str) -> list[str]:
    section = SUMMARY_BULLETS_SECTION_RE.search(text)
    if not section:
        return []

    bullets: list[str] = []
    for match in SUMMARY_BULLET_LINE_RE.finditer(section.group(1)):
        bullet = match.group(1).strip()
        if bullet:
            bullets.append(bullet)
        if len(bullets) >= 5:
            break
    return bullets


def extract_composite(text: str) -> float | None:
    composite_line = COMPOSITE_LINE_RE.search(text)
    if composite_line:
        block = text[composite_line.start() : composite_line.start() + 500]
        scores = COMPOSITE_SCORE_RE.findall(block)
        if scores:
            return float(scores[-1])

    total_match = re.search(r"Total\s*=\s*([\d.]+)\s*/\s*100", text, re.IGNORECASE)
    if total_match:
        return float(total_match.group(1))

    return None


def parse_score_response(text: str) -> dict:
    result: dict = {"raw_response": text}

    summary_bullets = extract_summary_bullets(text)
    if summary_bullets:
        result["summary_bullets"] = summary_bullets

    composite = extract_composite(text)
    if composite is not None:
        result["composite"] = composite

    confidence_match = CONFIDENCE_RE.search(text)
    if confidence_match:
        result["confidence"] = confidence_match.group(1).capitalize()

    for name, pattern in DIMENSION_RES.items():
        match = pattern.search(text)
        if match:
            result[name] = float(match.group(1))

    claim_match = re.search(
        r"Central claim\(s\):\s*(.+?)(?=\n-\s*Substance:|\nSubstance:|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if claim_match:
        result["central_claims"] = claim_match.group(1).strip()

    return result


def safe_filename(title: str, video_id: str) -> str:
    name = re.sub(r"[/\\]", "-", title).strip() or video_id
    return f"{name} [{video_id}]"


def load_videos(index_path: Path) -> list[dict]:
    payload = json.loads(index_path.read_text())
    videos = payload.get("videos") or []
    return [video for video in videos if video.get("transcript_status") == "ok"]


def write_rankings(
    output_dir: Path,
    model: str,
    prompt_path: Path,
    results: list[dict],
    index_path: Path,
    *,
    max_like_adjustment: float = 3.0,
) -> list[dict]:
    index_by_id = index_videos_by_id(json.loads(index_path.read_text()))
    ranked = apply_like_rank_adjustment(
        results,
        index_by_id,
        max_adjustment=max_like_adjustment,
    )

    for rank, result in enumerate(ranked, start=1):
        result["rank"] = rank
        result["tags"] = dimension_tags(result)

    rankings_path = output_dir / "rankings.json"
    rankings_path.write_text(
        json.dumps(
            {
                "model": model,
                "prompt_path": str(prompt_path),
                "video_count": len(results),
                "ranked_count": len(ranked),
                "rankings": ranked,
                "failures": [result for result in results if result.get("status") != "ok"],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )

    print("\nRankings (best first):\n")
    for result in ranked:
        print(
            f"{result['rank']:>2}. {result['composite']:.1f}/100  {result['title']}"
        )

    print(f"\nSaved detailed scores to {output_dir}/")
    print(f"Rankings: {rankings_path}")
    return ranked


def reparse_rankings(
    index_path: Path,
    output_dir: Path,
    model: str,
    prompt_path: Path,
) -> int:
    videos = load_videos(index_path)
    results: list[dict] = []

    for video in videos:
        score_path = output_dir / f"{safe_filename(video['title'], video['id'])}.txt"
        if not score_path.exists():
            results.append(
                {
                    "id": video["id"],
                    "title": video["title"],
                    "url": video.get("url"),
                    "status": "failed",
                    "error": f"missing score file: {score_path}",
                }
            )
            continue

        parsed = parse_score_response(score_path.read_text())
        results.append(
            {
                "id": video["id"],
                "title": video["title"],
                "speakers": extract_speakers(video["title"], video.get("description")),
                "url": video.get("url"),
                "status": "ok",
                "score_path": str(score_path),
                **{key: value for key, value in parsed.items() if key != "raw_response"},
            }
        )

    ranked = write_rankings(
        output_dir,
        model,
        prompt_path,
        results,
        index_path,
    )
    return 0 if ranked else 1


def score_video_job(
    *,
    index: int,
    total: int,
    video: dict,
    template: str,
    api_key: str,
    model: str,
    output_dir: Path,
    cache: ApiCache,
    concurrency: AdaptiveConcurrency,
    use_cache: bool,
    force_rescore: bool,
) -> dict:
    title = video["title"]
    video_id = video["id"]
    transcript_path = Path(video["transcript_path"])
    stem = safe_filename(title, video_id)
    score_path = output_dir / f"{stem}.txt"

    log(f"[{index}/{total}] {title}")

    if not transcript_path.exists():
        log(f"  -> skipped: missing transcript at {transcript_path}")
        return {
            "id": video_id,
            "title": title,
            "url": video.get("url"),
            "status": "failed",
            "error": f"missing transcript at {transcript_path}",
        }

    if score_path.exists() and not force_rescore:
        parsed = parse_score_response(score_path.read_text())
        entry = {
            "id": video_id,
            "title": title,
            "speakers": extract_speakers(title, video.get("description")),
            "url": video.get("url"),
            "status": "ok",
            "score_path": str(score_path),
            "cache_hit": True,
            **{key: value for key, value in parsed.items() if key != "raw_response"},
        }
        composite = entry.get("composite")
        log(f"  -> reused existing score | {composite if composite is not None else '?'}")
        return entry

    transcript = transcript_path.read_text()
    speakers = extract_speakers(title, video.get("description"))
    prompt = build_prompt(template, title, speakers, transcript)

    try:
        response_text, cache_hit = score_transcript_with_retries(
            api_key,
            model,
            prompt,
            cache=cache,
            concurrency=concurrency,
            use_cache=use_cache,
        )
        parsed = parse_score_response(response_text)
    except Exception as exc:  # noqa: BLE001
        log(f"  -> failed: {exc}")
        return {
            "id": video_id,
            "title": title,
            "url": video.get("url"),
            "status": "failed",
            "error": str(exc),
        }

    score_path.write_text(response_text)
    entry = {
        "id": video_id,
        "title": title,
        "speakers": speakers,
        "url": video.get("url"),
        "status": "ok",
        "score_path": str(score_path),
        "cache_hit": cache_hit,
        **{key: value for key, value in parsed.items() if key != "raw_response"},
    }

    composite = entry.get("composite")
    source = "cache" if cache_hit else "api"
    log(f"  -> {source} | {composite if composite is not None else '?'}")
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Score talk transcripts and rank by quality.")
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX_PATH)
    parser.add_argument("--prompt", type=Path, default=DEFAULT_PROMPT_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Parallel scoring workers")
    parser.add_argument(
        "--max-workers",
        type=int,
        default=8,
        help="Upper bound when increasing parallelism after successful calls",
    )
    parser.add_argument(
        "--request-delay",
        type=float,
        default=0.0,
        help="Deprecated sequential delay; kept for compatibility",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Disable Fireworks response cache",
    )
    parser.add_argument(
        "--force-rescore",
        action="store_true",
        help="Re-score even when a score file already exists",
    )
    parser.add_argument(
        "--reparse",
        action="store_true",
        help="Rebuild rankings.json from existing score files without calling the API",
    )
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("FIREWORKS_API_KEY", "").strip()

    if args.reparse:
        return reparse_rankings(args.index, args.output_dir, args.model, args.prompt)
    if not api_key:
        print("FIREWORKS_API_KEY is required in .env", file=sys.stderr)
        return 1

    if not args.index.exists():
        print(f"Missing index: {args.index}", file=sys.stderr)
        return 1
    if not args.prompt.exists():
        print(f"Missing prompt: {args.prompt}", file=sys.stderr)
        return 1

    template = load_prompt_template(args.prompt)
    videos = load_videos(args.index)
    if not videos:
        print("No scored transcripts found in index.", file=sys.stderr)
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)
    cache = ApiCache("fireworks")
    concurrency = AdaptiveConcurrency(
        initial=max(1, args.workers),
        minimum=1,
        maximum=max(1, args.max_workers),
    )
    use_cache = not args.no_cache

    print(
        f"Scoring {len(videos)} talks with {args.model} "
        f"using up to {args.workers} workers (adaptive 1-{args.max_workers})...\n"
    )

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(
                score_video_job,
                index=index,
                total=len(videos),
                video=video,
                template=template,
                api_key=api_key,
                model=args.model,
                output_dir=args.output_dir,
                cache=cache,
                concurrency=concurrency,
                use_cache=use_cache,
                force_rescore=args.force_rescore,
            ): video
            for index, video in enumerate(videos, start=1)
        }

        for future in as_completed(futures):
            results.append(future.result())
            if args.request_delay > 0:
                time.sleep(args.request_delay)

    ranked = write_rankings(
        args.output_dir,
        args.model,
        args.prompt,
        results,
        args.index,
    )
    return 0 if ranked else 1


if __name__ == "__main__":
    raise SystemExit(main())
