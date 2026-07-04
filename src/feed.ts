import "./styles.css";
import "./feed.css";
import type { RankedVideo, RankingsPayload } from "./types";
import {
  visibleScoredFromPayload,
  type SourceDisplayFilter,
} from "./lib/visible-ranked.js";
import {
  meetsScoreFilter,
  mountScoreFilter,
  readScoreFilter,
  syncScoreFilterButtons,
  type ScoreFilterMin,
} from "./lib/score-filter.js";
import {
  meetsContentKindFilter,
  mountContentKindFilter,
  readContentKindFilter,
  syncContentKindFilterButtons,
} from "./lib/content-kind-filter.js";
import { sortVideos, type SortMode } from "./lib/ranked-list.js";
import {
  mountSortFilter,
  readSortMode,
  syncSortFilter,
} from "./lib/sort-filter.js";
import {
  meetsTimeFilter,
  mountTimeFilter,
  readTimeFilter,
  syncTimeFilter,
  type TimeFilterDays,
} from "./lib/time-filter.js";
import {
  meetsAudienceLevelFilter,
  mountAudienceLevelFilter,
  readAudienceLevelFilter,
  syncAudienceLevelFilter,
} from "./lib/audience-level-filter.js";
import {
  meetsFeedSourceFilter,
  mountFeedSourceFilter,
  readFeedSourceFilter,
  syncFeedSourceFilter,
} from "./lib/feed-source-filter.js";
import { mountFilterDropdownInteraction } from "./lib/filter-dropdown.js";
import {
  closeScoreBreakdown,
  cloneRankedCard,
  mountRankedCardInteraction,
} from "./lib/ranked-card.js";
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

let allFeedItems: FeedItem[] = [];
let allSources: PublicSource[] = [];
let scoreFilterMin: ScoreFilterMin = readScoreFilter("feed");
let contentKindFilter = readContentKindFilter();
let audienceLevelFilter = readAudienceLevelFilter();
let sourceFilter = new Set<string>();
let sortMode: SortMode = readSortMode();
let timeFilterDays: TimeFilterDays = readTimeFilter();

function visibleScoredItems(source: PublicSource, payload: RankingsPayload): RankedVideo[] {
  const displayFilter: SourceDisplayFilter = {
    maxDisplayAgeDays: source.maxDisplayAgeDays,
    dateRange: source.dateRange,
  };
  return visibleScoredFromPayload(payload, displayFilter);
}

function sortFeedItems(items: FeedItem[], mode: SortMode): FeedItem[] {
  const sortedVideos = sortVideos(
    items.map((item) => item.video),
    mode,
  );
  const itemsById = new Map(items.map((item) => [item.video.id, item]));
  return sortedVideos.flatMap((video) => {
    const item = itemsById.get(video.id);
    return item ? [item] : [];
  });
}

async function loadFeedItems(sources: PublicSource[]): Promise<FeedItem[]> {
  const payloads = await Promise.all(
    sources.map(async (source) => {
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

  return items;
}

function hasActiveFilters(): boolean {
  if (
    contentKindFilter.size > 0 ||
    audienceLevelFilter.size > 0 ||
    timeFilterDays != null ||
    sourceFilter.size > 0
  ) {
    return true;
  }
  return scoreFilterMin !== 7;
}

function filteredFeedItems(items: FeedItem[]): FeedItem[] {
  return items.filter(
    (item) =>
      meetsScoreFilter(item.video.composite, scoreFilterMin) &&
      meetsContentKindFilter(item.source.contentKind, contentKindFilter) &&
      meetsAudienceLevelFilter(item.video.audience_level, audienceLevelFilter) &&
      meetsFeedSourceFilter(item.source.slug, sourceFilter) &&
      meetsTimeFilter(item.video.upload_date, timeFilterDays),
  );
}

function renderFeedMeta(filteredCount: number, totalCount: number): void {
  const meta = document.getElementById("feed-meta");
  if (!meta) {
    return;
  }

  if (filteredCount !== totalCount) {
    meta.textContent = `${filteredCount} ranked items (from ${totalCount})`;
    return;
  }
  meta.textContent = `${filteredCount} ranked items`;
}

function renderFeed(items: FeedItem[]): void {
  const list = document.getElementById("feed-list");
  const template = document.getElementById("card-template") as HTMLTemplateElement | null;
  if (!list || !template) {
    return;
  }

  closeScoreBreakdown();
  const filtered = sortFeedItems(filteredFeedItems(items), sortMode);
  renderFeedMeta(filtered.length, items.length);
  list.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "score-filter-empty";
    empty.textContent = hasActiveFilters()
      ? "No items match the current filters."
      : "No ranked items yet.";
    list.appendChild(empty);
    return;
  }

  for (const item of filtered) {
    const card = cloneRankedCard(template, item.video, {
      useYoutubeThumbs: item.source.contentKind !== "essay",
      coverImageFallback: item.source.contentKind === "essay" ? item.source.coverImage : null,
      contentKind: item.source.contentKind,
      source: {
        title: item.source.title,
        href: sourcePagePath(item.source.slug),
      },
    });
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

function rerenderFeed(): void {
  renderFeed(allFeedItems);
}

async function init(): Promise<void> {
  mountRankedCardInteraction();
  mountFilterDropdownInteraction();

  const manifest = await loadSourcesManifest();
  allSources = manifest.sources;
  sourceFilter = readFeedSourceFilter(new Set(allSources.map((source) => source.slug)));
  allFeedItems = await loadFeedItems(allSources);

  const sortFilterContainer = document.getElementById("sort-filters");
  if (sortFilterContainer) {
    mountSortFilter(sortFilterContainer, sortMode, (mode) => {
      sortMode = mode;
      syncSortFilter(sortFilterContainer, sortMode);
      rerenderFeed();
    });
  }

  const kindFilterContainer = document.getElementById("content-kind-filters");
  if (kindFilterContainer) {
    mountContentKindFilter(kindFilterContainer, contentKindFilter, (selected) => {
      contentKindFilter = selected;
      syncContentKindFilterButtons(kindFilterContainer, contentKindFilter);
      rerenderFeed();
    });
  }

  const audienceLevelFilterContainer = document.getElementById("audience-level-filters");
  if (audienceLevelFilterContainer) {
    mountAudienceLevelFilter(audienceLevelFilterContainer, audienceLevelFilter, (selected) => {
      audienceLevelFilter = selected;
      syncAudienceLevelFilter(audienceLevelFilterContainer, audienceLevelFilter);
      rerenderFeed();
    });
  }

  const sourceFilterContainer = document.getElementById("source-filters");
  if (sourceFilterContainer) {
    mountFeedSourceFilter(sourceFilterContainer, allSources, sourceFilter, (selected) => {
      sourceFilter = selected;
      syncFeedSourceFilter(sourceFilterContainer, allSources, sourceFilter);
      rerenderFeed();
    });
  }

  const timeFilterContainer = document.getElementById("time-filters");
  if (timeFilterContainer) {
    mountTimeFilter(timeFilterContainer, timeFilterDays, (days) => {
      timeFilterDays = days;
      syncTimeFilter(timeFilterContainer, timeFilterDays);
      rerenderFeed();
    });
  }

  const scoreFilterContainer = document.getElementById("score-filters");
  if (scoreFilterContainer) {
    mountScoreFilter(
      scoreFilterContainer,
      scoreFilterMin,
      (min) => {
        scoreFilterMin = min;
        syncScoreFilterButtons(scoreFilterContainer, scoreFilterMin);
        rerenderFeed();
      },
      "feed",
    );
  }

  renderFeed(allFeedItems);
}

init().catch((error: Error) => {
  renderError(error.message);
});
