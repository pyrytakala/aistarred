import "./styles.css";
import "./feed.css";
import type { RankedVideo, RankingsPayload } from "./types";
import { shouldDisplayVideo } from "./lib/source-filter.js";
import { isScoredRanking } from "./lib/score-bands.js";
import { parseUploadDate } from "./lib/video-age.js";
import { audienceLevelLabel } from "./lib/audience-level.js";
import {
  loadSourcesManifest,
  rankingsUrlForSource,
} from "./lib/sources-manifest.js";
import { sourcePagePath } from "./lib/source-urls.js";
import type { PublicSource } from "./lib/public-source.js";

interface FeedItem {
  video: RankedVideo;
  source: PublicSource;
}

function itemThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

const THUMB_PLACEHOLDER_ICON_SVG =
  '<svg class="thumb-placeholder-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M14 3v4a1 1 0 0 0 1 1h4" />' +
  '<path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />' +
  '<path d="M9 13h6" /><path d="M9 17h4" />' +
  "</svg>";

function formatAbsoluteDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRelativeDate(uploadDate: string | null | undefined): string | null {
  const date = parseUploadDate(uploadDate);
  if (!date) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }

  const years = Math.floor(diffDays / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return (Number(value) / 10).toFixed(1);
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0 || Number.isNaN(seconds)) {
    return null;
  }

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function applyThumbnail(
  thumbLink: HTMLAnchorElement,
  thumb: HTMLImageElement,
  video: RankedVideo,
  useYoutubeThumbs: boolean,
): void {
  if (useYoutubeThumbs) {
    thumbLink.classList.remove("thumb-link--placeholder");
    thumbLink.querySelector(".thumb-placeholder")?.remove();
    thumb.src = itemThumbnailUrl(video.id);
    thumb.alt = video.title;
    return;
  }

  thumb.removeAttribute("src");
  thumb.alt = "";
  thumbLink.classList.add("thumb-link--placeholder");
  if (!thumbLink.querySelector(".thumb-placeholder")) {
    const placeholder = document.createElement("span");
    placeholder.className = "thumb-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.innerHTML = THUMB_PLACEHOLDER_ICON_SVG;
    thumbLink.insertBefore(placeholder, thumb);
  }
}

function visibleScoredItems(source: PublicSource, payload: RankingsPayload): RankedVideo[] {
  const displayFilter = {
    maxDisplayAgeDays: source.maxDisplayAgeDays,
    dateRange: source.dateRange,
  };
  const inRange = (videos: RankedVideo[]) =>
    (videos || []).filter(
      (video) => shouldDisplayVideo(video.upload_date, displayFilter) && isScoredRanking(video),
    );

  const primary = inRange(payload.rankings || []);
  const seen = new Set(primary.map((video) => video.id));
  const merged = [...primary];

  for (const video of inRange(payload.other || [])) {
    if (!seen.has(video.id)) {
      merged.push(video);
      seen.add(video.id);
    }
  }

  return merged;
}

function sortFeedItems(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => {
    const dateA = parseUploadDate(a.video.upload_date)?.getTime() ?? 0;
    const dateB = parseUploadDate(b.video.upload_date)?.getTime() ?? 0;
    if (dateB !== dateA) {
      return dateB - dateA;
    }
    return (b.video.composite ?? 0) - (a.video.composite ?? 0);
  });
}

async function loadFeedItems(): Promise<FeedItem[]> {
  const manifest = await loadSourcesManifest();
  const payloads = await Promise.all(
    manifest.sources.map(async (source) => {
      const response = await fetch(rankingsUrlForSource(source.id));
      if (!response.ok) {
        return { source, payload: null as RankingsPayload | null };
      }
      const payload = (await response.json()) as RankingsPayload;
      return { source, payload };
    }),
  );

  const items: FeedItem[] = [];
  for (const { source, payload } of payloads) {
    if (!payload) {
      continue;
    }
    for (const video of visibleScoredItems(source, payload)) {
      items.push({ video, source });
    }
  }

  return sortFeedItems(items);
}

function populateFeedCard(item: FeedItem, template: HTMLTemplateElement): HTMLElement | null {
  const node = template.content.cloneNode(true) as DocumentFragment;
  const cardEl = node.querySelector<HTMLElement>(".card");
  if (!cardEl) {
    return null;
  }

  const duration = cardEl.querySelector<HTMLElement>(".duration");
  const thumbLink = cardEl.querySelector<HTMLAnchorElement>(".thumb-link");
  const thumb = cardEl.querySelector<HTMLImageElement>(".thumb");
  const titleLink = cardEl.querySelector<HTMLAnchorElement>(".title-link");
  const summaryWrap = cardEl.querySelector<HTMLElement>(".summary-wrap");
  const audienceLevel = cardEl.querySelector<HTMLElement>(".audience-level");
  const audienceWrap = cardEl.querySelector<HTMLElement>(".audience-level-wrap");
  const published = cardEl.querySelector<HTMLTimeElement>(".published");
  const score = cardEl.querySelector<HTMLElement>(".score");
  const sourceLink = cardEl.querySelector<HTMLAnchorElement>(".feed-source-link");

  const { video, source } = item;
  if (!thumbLink || !thumb || !duration || !titleLink || !published || !video.url) {
    return null;
  }

  applyThumbnail(thumbLink, thumb, video, source.contentKind !== "essay");
  thumbLink.href = video.url;

  const durationLabel = formatDuration(video.duration_seconds);
  if (durationLabel) {
    duration.textContent = durationLabel;
    duration.hidden = false;
  } else {
    duration.textContent = "";
    duration.hidden = true;
  }

  titleLink.href = video.url;
  titleLink.title = video.title;
  titleLink.textContent = video.title;

  if (sourceLink) {
    sourceLink.href = sourcePagePath(source.slug);
    sourceLink.textContent = source.title;
  }

  const level = audienceLevelLabel(video.audience_level);
  if (audienceLevel && audienceWrap) {
    if (level) {
      audienceLevel.textContent = level;
      audienceWrap.hidden = false;
    } else {
      audienceLevel.textContent = "";
      audienceWrap.hidden = true;
    }
  }

  const uploadDate = parseUploadDate(video.upload_date);
  if (uploadDate) {
    published.hidden = false;
    published.dateTime = video.upload_date ?? "";
    published.title = formatAbsoluteDate(uploadDate);
    published.textContent = formatRelativeDate(video.upload_date);
  } else {
    published.hidden = true;
  }

  if (score) {
    score.textContent = formatScore(video.composite);
  }

  if (summaryWrap) {
    const list = summaryWrap.querySelector<HTMLElement>(".summary");
    if (list) {
      list.replaceChildren();
      for (const bullet of video.summary_bullets || []) {
        const li = document.createElement("li");
        li.textContent = bullet;
        list.appendChild(li);
      }
    }
    summaryWrap.hidden = !(video.summary_bullets || []).length;
  }

  cardEl.dataset.videoId = video.id;
  return cardEl;
}

function renderFeed(items: FeedItem[]): void {
  const list = document.getElementById("feed-list");
  const meta = document.getElementById("feed-meta");
  const template = document.getElementById("feed-card-template") as HTMLTemplateElement | null;
  if (!list || !template) {
    return;
  }

  list.replaceChildren();

  if (meta) {
    meta.textContent = `${items.length} ranked items across all sources`;
  }

  for (const item of items) {
    const card = populateFeedCard(item, template);
    if (card) {
      list.appendChild(card);
    }
  }
}

function renderError(message: string): void {
  const list = document.getElementById("feed-list");
  const meta = document.getElementById("feed-meta");
  if (meta) {
    meta.textContent = "Could not load feed";
  }
  if (!list) {
    return;
  }
  list.replaceChildren();
  const error = document.createElement("div");
  error.className = "feed-error";
  error.textContent = message;
  list.appendChild(error);
}

async function init(): Promise<void> {
  const items = await loadFeedItems();
  renderFeed(items);
}

init().catch((error: Error) => {
  renderError(error.message);
});
