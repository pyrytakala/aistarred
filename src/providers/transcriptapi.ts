import { loadEnv } from "../lib/env.js";
import { ApiCache, fetchCachedJson } from "../lib/api-cache.js";
import {
  monthsAgo,
  daysAgo,
  parseIsoDatetime,
  plainTextFromString,
  uploadDateFromIso,
  sleep,
} from "../lib/utils.js";
import { dateFromYyyymmdd } from "../lib/date-range.js";
import { TranscriptProviderError, type TranscriptProvider } from "./types.js";

const DURATION_RE = /(?:(\d+):)?(\d+):(\d+)/;

function parseViewCount(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase().replace(/,/g, "").trim();
  const match = /([\d.]+)\s*([km])?/.exec(normalized);
  if (!match) {
    return null;
  }
  let amount = Number(match[1]);
  const suffix = match[2];
  if (suffix === "k") {
    amount *= 1000;
  } else if (suffix === "m") {
    amount *= 1_000_000;
  }
  return Math.trunc(amount);
}

function parseDurationSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = DURATION_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

export class TranscriptApiProvider implements TranscriptProvider {
  static readonly name = "transcriptapi";
  readonly name = TranscriptApiProvider.name;
  private readonly apiKey: string;
  private readonly cache: ApiCache;
  private readonly useCache: boolean;
  private readonly baseUrl = "https://transcriptapi.com/api/v2";

  constructor(useCache = true) {
    loadEnv();
    this.apiKey = (process.env.TRANSCRIPTAPI_API_KEY ?? "").trim();
    if (!this.apiKey) {
      throw new TranscriptProviderError("TRANSCRIPTAPI_API_KEY is required in .env");
    }
    this.cache = new ApiCache(this.name);
    this.useCache = useCache;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async fetchJson(
    method: string,
    path: string,
    init?: RequestInit & { params?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const url = new URL(`${this.baseUrl}${path}`);
      if (init?.params) {
        for (const [key, value] of Object.entries(init.params)) {
          url.searchParams.set(key, value);
        }
      }

      const response = await fetch(url, {
        method,
        headers: this.headers(),
        signal: AbortSignal.timeout(120_000),
      });

      if ([408, 429, 503].includes(response.status)) {
        const retryAfter = response.headers.get("Retry-After");
        const wait = retryAfter ? Number(retryAfter) : Math.min(30, 2 ** attempt * 2);
        await sleep(wait);
        continue;
      }

      if (!response.ok) {
        let message = await response.text();
        try {
          const payload = JSON.parse(message) as Record<string, unknown>;
          const detail = payload.detail;
          message =
            typeof detail === "object" && detail && "message" in detail
              ? String((detail as Record<string, unknown>).message)
              : String(detail ?? payload.message ?? message);
        } catch {
          // keep text
        }
        throw new TranscriptProviderError(`HTTP ${response.status}: ${message}`);
      }

      return (await response.json()) as Record<string, unknown>;
    }

    throw new TranscriptProviderError("HTTP 429: request failed after retries");
  }

  private async request(
    method: string,
    path: string,
    params?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;
    const [payload] = await fetchCachedJson(this.cache, {
      method,
      url,
      params,
      fetcher: () => this.fetchJson(method, path, { params }),
      enabled: this.useCache,
    });
    return payload;
  }

  private async channelLatest(channelUrl: string): Promise<Record<string, unknown>[]> {
    const payload = await this.request("GET", "/youtube/channel/latest", { channel: channelUrl });
    return (payload.results as Record<string, unknown>[]) ?? [];
  }

  private async channelVideosPage(options: {
    channelUrl?: string;
    continuation?: string;
  }): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {};
    if (options.continuation) {
      params.continuation = options.continuation;
    } else {
      params.channel = options.channelUrl ?? "";
    }
    return this.request("GET", "/youtube/channel/videos", params);
  }

  async listChannelVideosSince(
    channelUrl: string,
    options: {
      months?: number;
      days?: number;
      since?: string;
      until?: string;
      probeLimit?: number;
      maxVideos?: number | null;
      requestDelay?: number;
    } = {},
  ): Promise<Array<[string, Record<string, unknown>]>> {
    const probeLimit = options.probeLimit ?? 500;
    const requestDelay = options.requestDelay ?? 1;
    const sinceDate = options.since ? dateFromYyyymmdd(options.since) : null;
    const untilDate = options.until ? dateFromYyyymmdd(options.until) : null;
    if (untilDate) {
      untilDate.setHours(23, 59, 59, 999);
    }
    const cutoff = sinceDate
      ? new Date(sinceDate.getFullYear(), sinceDate.getMonth(), sinceDate.getDate())
      : options.days != null
        ? daysAgo(options.days)
        : monthsAgo(options.months ?? 2);

    const publishedMap = new Map<string, Date>();
    for (const item of await this.channelLatest(channelUrl)) {
      const videoId = item.videoId as string | undefined;
      const published = parseIsoDatetime(item.published as string | undefined);
      if (videoId && published) {
        publishedMap.set(videoId, published);
      }
    }

    const ordered: Array<[string, Record<string, unknown>]> = [];
    const seen = new Set<string>();
    let continuation: string | undefined;

    while (ordered.length < probeLimit) {
      const payload = await this.channelVideosPage({
        channelUrl: continuation ? undefined : channelUrl,
        continuation,
      });
      const results = (payload.results as Record<string, unknown>[]) ?? [];
      if (!results.length) {
        break;
      }

      let stop = false;
      for (const item of results) {
        const videoId = item.videoId as string | undefined;
        if (!videoId || seen.has(videoId)) {
          continue;
        }

        const metadata = this.mergeVideoMetadata(item, publishedMap.get(videoId) ?? null);
        const published = parseIsoDatetime(metadata.published as string | undefined);
        if (published && published < cutoff) {
          stop = true;
          break;
        }
        if (published && untilDate && published > untilDate) {
          continue;
        }

        ordered.push([videoId, metadata]);
        seen.add(videoId);

        if (options.maxVideos != null && ordered.length >= options.maxVideos) {
          stop = true;
          break;
        }
        if (ordered.length >= probeLimit) {
          stop = true;
          break;
        }
      }

      if (stop) {
        break;
      }

      if (!payload.has_more || !payload.continuation_token) {
        break;
      }

      continuation = String(payload.continuation_token);
      if (requestDelay > 0) {
        await sleep(requestDelay);
      }
    }

    const windowDays =
      options.days != null ? Math.trunc(options.days) : Math.max(Math.trunc((options.months ?? 2) * 30), 30);
    const undatedCap = Math.max(windowDays, 30);
    const filtered: Array<[string, Record<string, unknown>]> = [];
    for (const [index, entry] of ordered.entries()) {
      const [videoId, metadata] = entry;
      const published = parseIsoDatetime(metadata.published as string | undefined);
      if (published) {
        if (published >= cutoff && (!untilDate || published <= untilDate)) {
          filtered.push([videoId, metadata]);
        }
        continue;
      }
      if (index < undatedCap) {
        filtered.push([videoId, metadata]);
      }
    }

    if (options.maxVideos != null) {
      return filtered.slice(0, options.maxVideos);
    }
    return filtered;
  }

  private mergeVideoMetadata(
    item: Record<string, unknown>,
    published: Date | null,
  ): Record<string, unknown> {
    const merged = { ...item };
    if (published) {
      merged.published = published.toISOString();
    }
    return merged;
  }

  async getMetadata(videoId: string): Promise<Record<string, unknown>> {
    const payload = await this.request("GET", "/youtube/transcript", {
      video_url: videoId,
      format: "text",
      include_timestamp: "false",
      send_metadata: "true",
    });
    const metadata = { ...((payload.metadata as Record<string, unknown>) ?? {}) };
    metadata.video_id = payload.video_id ?? videoId;
    metadata.title = metadata.title ?? payload.title;
    return metadata;
  }

  async getTranscript(videoId: string): Promise<[string, Record<string, unknown>]> {
    const payload = await this.request("GET", "/youtube/transcript", {
      video_url: videoId,
      format: "text",
      include_timestamp: "false",
      send_metadata: "false",
    });

    const transcript = payload.transcript;
    let text = "";
    if (Array.isArray(transcript)) {
      const lines = transcript
        .map((segment) => String((segment as Record<string, unknown>).text ?? "").trim())
        .filter(Boolean);
      text = plainTextFromString(lines.join("\n"));
    } else if (typeof transcript === "string" && transcript.trim()) {
      text = plainTextFromString(transcript);
    } else {
      throw new TranscriptProviderError("empty transcript");
    }

    return [
      text,
      {
        language_code: payload.language ?? null,
        available_langs: payload.language ? [payload.language] : [],
      },
    ];
  }

  metadataToIndexFields(payload: Record<string, unknown>): Record<string, unknown> {
    const published = parseIsoDatetime(payload.published as string | undefined);
    return {
      title: payload.title,
      view_count: parseViewCount(payload.viewCountText as string | undefined),
      like_count: null,
      comment_count: null,
      upload_date: uploadDateFromIso(published?.toISOString()),
      duration_seconds: parseDurationSeconds(payload.lengthText as string | undefined),
      channel: payload.channelTitle ?? payload.author ?? payload.author_name,
      description: payload.description,
    };
  }
}
