import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { countWords } from "../content-length.js";
import { isWithinDateRange } from "../date-range.js";
import { pipelineLog, withPipelineTiming } from "../pipeline-log.js";
import { titleToFilename, sleep } from "../utils.js";
import type { VideoIndexEntry } from "../types.js";
import type { ContentFetchContext, ContentFetcher, ContentListItem } from "./types.js";

const BASE_URL = "https://paulgraham.com/";
const CATALOG_URL = "https://paulgraham.com/articles.html";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const MONTH_TO_NUMBER: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const SKIP_SLUGS = new Set([
  "index",
  "articles",
  "books",
  "rss",
  "bio",
  "faq",
  "raq",
  "quo",
  "arc",
  "bel",
  "lisp",
  "antispam",
  "kedrosky",
]);

function decodeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export function parsePaulGrahamDate(text: string): string | null {
  const match =
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(
      text,
    );
  if (!match) {
    return null;
  }

  const month = MONTH_TO_NUMBER[match[1].toLowerCase()];
  if (!month) {
    return null;
  }

  return `${match[2]}${month}01`;
}

export function listEssayLinks(catalogHtml: string): ContentListItem[] {
  const seen = new Set<string>();
  const items: ContentListItem[] = [];

  for (const match of catalogHtml.matchAll(/<a href="([^"#?]+\.html)">([^<]+)<\/a>/gi)) {
    const href = match[1];
    const title = match[2].trim();
    const slug = href.replace(/\.html$/i, "").split("/").pop() ?? href;
    if (!slug || SKIP_SLUGS.has(slug) || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    items.push({
      id: slug,
      title,
      url: new URL(href, BASE_URL).href,
    });
  }

  return items;
}

export function extractEssayBody(html: string): string {
  const fontBlocks = [...html.matchAll(/<font size="2" face="verdana">([\s\S]*?)<\/font>/gi)].map(
    (match) => match[1],
  );
  const raw = fontBlocks.length > 0 ? fontBlocks.join("\n") : html;
  const stripped = stripHtml(raw);

  const lines = stripped
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bodyStart = lines.findIndex(
    (line) =>
      !/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(
        line,
      ),
  );

  return lines.slice(Math.max(bodyStart, 0)).join("\n\n").trim();
}

async function fetchText(url: string, timeoutMs = 30_000): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function probeEssayDate(url: string): Promise<string | null> {
  const html = await fetchText(url);
  const fontMatch = html.match(/<font size="2" face="verdana">([\s\S]{0,400})/i);
  return parsePaulGrahamDate(fontMatch?.[1] ?? html);
}

export const paulGrahamFetcher: ContentFetcher = {
  kind: "paul-graham",

  async listItems(context: ContentFetchContext): Promise<ContentListItem[]> {
    const catalogUrl = context.sourceUrl || CATALOG_URL;
    const catalogHtml = await withPipelineTiming(
      "essay-fetch",
      "list-catalog",
      { sourceId: context.sourceId, catalogUrl },
      () => fetchText(catalogUrl),
    );

    const links = listEssayLinks(catalogHtml);
    const items: ContentListItem[] = [];
    const knownDates = context.knownUploadDates ?? {};
    let nullDateStreak = 0;
    const maxProbeLinks = 40;

    for (const [index, link] of links.entries()) {
      const isKnown = link.id in knownDates;
      if (index >= maxProbeLinks && !isKnown) {
        continue;
      }

      if (context.requestDelayMs > 0 && index > 0 && !isKnown) {
        await sleep(context.requestDelayMs);
      }

      let uploadDate = knownDates[link.id] ?? null;
      if (!uploadDate) {
        uploadDate = await withPipelineTiming(
          "essay-fetch",
          "probe-date",
          { sourceId: context.sourceId, essayId: link.id, url: link.url },
          () => probeEssayDate(link.url),
        );
      }

      if (!uploadDate) {
        nullDateStreak += 1;
        if (items.length > 0 && nullDateStreak >= 5) {
          break;
        }
        continue;
      }

      nullDateStreak = 0;

      if (context.dateRange && uploadDate < context.dateRange.since) {
        break;
      }

      if (context.dateRange && !isWithinDateRange(uploadDate, context.dateRange)) {
        continue;
      }

      items.push({ ...link, upload_date: uploadDate });

      if (context.maxItems != null && context.maxItems > 0 && items.length >= context.maxItems) {
        break;
      }
    }

    pipelineLog("essay-fetch", "list-complete", {
      sourceId: context.sourceId,
      count: items.length,
      dateRange: context.dateRange ?? null,
    });

    return items;
  },

  async fetchItem(
    item: ContentListItem,
    context: ContentFetchContext,
    usedNames: Set<string>,
  ): Promise<VideoIndexEntry> {
    const result: VideoIndexEntry = {
      id: item.id,
      title: item.title,
      url: item.url,
      upload_date: item.upload_date ?? null,
      channel: "Paul Graham",
      description: null,
    };

    try {
      const html = await withPipelineTiming(
        "essay-fetch",
        "fetch-essay",
        { sourceId: context.sourceId, essayId: item.id, url: item.url },
        () => fetchText(item.url),
      );

      const uploadDate = parsePaulGrahamDate(html) ?? item.upload_date ?? null;
      const text = extractEssayBody(html);
      if (!text || text.length < 200) {
        throw new Error("essay body too short or missing");
      }

      let filename = titleToFilename(item.title);
      if (usedNames.has(filename)) {
        filename = `${filename.replace(/\.txt$/, "")} [${item.id}].txt`;
      }
      usedNames.add(filename);

      const textPath = join(context.outputDir, filename);
      writeFileSync(textPath, text, "utf8");

      result.upload_date = uploadDate;
      result.transcript_status = "ok";
      result.transcript_provider = "paul-graham-html";
      result.transcript_path = textPath;
      result.line_count = text.split(/\r?\n/).length;
      result.word_count = countWords(text);
      result.language_code = "en";
      result.available_langs = ["en"];
    } catch (error) {
      result.transcript_status = "failed";
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  },
};
