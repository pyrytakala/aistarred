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

export class SupadataProvider implements TranscriptProvider {
  static readonly name = "supadata";
  readonly name = SupadataProvider.name;
  private readonly apiKey: string;
  private readonly cache: ApiCache;
  private readonly useCache: boolean;
  private readonly baseUrl = "https://api.supadata.ai/v1";

  constructor(useCache = true) {
    loadEnv();
    this.apiKey = (process.env.SUPADATA_API_KEY ?? "").trim();
    if (!this.apiKey) {
      throw new TranscriptProviderError("SUPADATA_API_KEY is required in .env");
    }
    this.cache = new ApiCache(this.name);
    this.useCache = useCache;
  }

  private async fetchJson(
    method: string,
    path: string,
    init?: RequestInit & { params?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const url = new URL(`${this.baseUrl}${path}`);
      if (init?.params) {
        for (const [key, value] of Object.entries(init.params)) {
          url.searchParams.set(key, value);
        }
      }

      const response = await fetch(url, {
        method,
        headers: { "x-api-key": this.apiKey },
        signal: AbortSignal.timeout(60_000),
      });

      if (response.status === 429) {
        await sleep(Math.min(60, 2 ** attempt * 5));
        continue;
      }

      if (!response.ok) {
        let message = await response.text();
        try {
          const payload = JSON.parse(message) as Record<string, unknown>;
          message = String(payload.message ?? payload.error ?? message);
        } catch {
          // keep text
        }
        throw new TranscriptProviderError(`HTTP ${response.status}: ${message}`);
      }

      return (await response.json()) as Record<string, unknown>;
    }

    throw new TranscriptProviderError("HTTP 429: rate limit exceeded after retries");
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

  private async listChannelVideos(channelUrl: string, limit: number): Promise<string[]> {
    const payload = await this.request("GET", "/youtube/channel/videos", {
      id: channelUrl,
      type: "video",
      limit: String(limit),
    });
    return ((payload.videoIds as string[]) ?? []).slice(0, limit);
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
    const cutoff = sinceDate
      ? new Date(sinceDate.getFullYear(), sinceDate.getMonth(), sinceDate.getDate())
      : options.days != null
        ? daysAgo(options.days)
        : monthsAgo(options.months ?? 2);
    const candidateIds = await this.listChannelVideos(channelUrl, probeLimit);

    const recent: Array<[string, Record<string, unknown>]> = [];
    for (const [index, videoId] of candidateIds.entries()) {
      const metadata = await this.getMetadata(videoId);
      const published = parseIsoDatetime(metadata.createdAt as string | undefined);
      if (!published || published < cutoff) {
        break;
      }

      recent.push([videoId, metadata]);
      if (options.maxVideos != null && recent.length >= options.maxVideos) {
        break;
      }
      if (requestDelay > 0 && index < candidateIds.length - 1) {
        await sleep(requestDelay);
      }
    }

    return recent;
  }

  async getMetadata(videoId: string): Promise<Record<string, unknown>> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    return this.request("GET", "/metadata", { url });
  }

  async getTranscript(videoId: string): Promise<[string, Record<string, unknown>]> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const payload = await this.request("GET", "/transcript", {
      url,
      text: "false",
      mode: "native",
      lang: "en",
    });

    const content = payload.content;
    let text = "";
    if (Array.isArray(content)) {
      const lines = content
        .map((chunk) => String((chunk as Record<string, unknown>).text ?? "").trim())
        .filter(Boolean);
      text = plainTextFromString(lines.join("\n"));
    } else if (typeof content === "string" && content.trim()) {
      text = plainTextFromString(content);
    } else {
      throw new TranscriptProviderError("empty transcript");
    }

    return [
      text,
      {
        language_code: payload.lang ?? null,
        available_langs: payload.availableLangs ?? [],
      },
    ];
  }

  metadataToIndexFields(payload: Record<string, unknown>): Record<string, unknown> {
    const stats = (payload.stats as Record<string, unknown>) ?? {};
    const media = (payload.media as Record<string, unknown>) ?? {};
    const author = (payload.author as Record<string, unknown>) ?? {};
    const published = parseIsoDatetime(payload.createdAt as string | undefined);

    return {
      title: payload.title,
      view_count: stats.views ?? null,
      like_count: stats.likes ?? null,
      comment_count: stats.comments ?? null,
      upload_date: uploadDateFromIso(published?.toISOString()),
      duration_seconds: media.duration ?? null,
      channel: author.displayName ?? null,
      description: payload.description ?? null,
    };
  }
}
