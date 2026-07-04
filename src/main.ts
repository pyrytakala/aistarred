import "./styles.css";
import type { RankedVideo, RankingsPayload } from "./types";
import { shouldDisplayVideo } from "./lib/source-filter.js";
import { isScoredRanking } from "./lib/score-bands.js";
import {
  meetsScoreFilter,
  mountScoreFilter,
  readScoreFilter,
  syncScoreFilterButtons,
  type ScoreFilterMin,
} from "./lib/score-filter.js";
import { isTooLongForScoring } from "./lib/scoring-limits.js";
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
import { contentKindLabels, type PublicSource } from "./lib/public-source.js";
import {
  loadPublicSourceBySlug,
  rankingsUrlForSource,
  slugFromPathname,
} from "./lib/sources-manifest.js";
import {
  closeScoreBreakdown,
  mountRankedCardInteraction,
  populateExcludedCard,
  populateRankedCard,
} from "./lib/ranked-card.js";
import { mountFilterDropdownInteraction } from "./lib/filter-dropdown.js";

interface PageState {
  source: PublicSource;
  contentLabels: ReturnType<typeof contentKindLabels>;
  itemLabel: string;
  displayFilter: {
    maxDisplayAgeDays: number | null;
    dateRange?: { since: string; until: string };
  };
  coverImage: string | null;
  useYoutubeThumbs: boolean;
  rankingsUrl: string;
}

let pageState: PageState | null = null;
let rankingsPayload: RankingsPayload | null = null;
let scoreFilterMin: ScoreFilterMin = readScoreFilter();
let sortMode: SortMode = readSortMode();
let timeFilterDays: TimeFilterDays = readTimeFilter();

function getPageState(): PageState {
  if (!pageState) {
    throw new Error("Page state not initialized");
  }
  return pageState;
}

function shouldShowVideo(uploadDate: string | null | undefined): boolean {
  return shouldDisplayVideo(uploadDate, getPageState().displayFilter);
}

function excludedTalks(payload: RankingsPayload): {
  tooLong: RankedVideo[];
  other: RankedVideo[];
} {
  const inRange = (videos: RankedVideo[]) =>
    videos.filter((video) => shouldShowVideo(video.upload_date));

  if (payload.too_long != null || payload.other != null) {
    return {
      tooLong: inRange(payload.too_long ?? []),
      other: inRange(payload.other ?? []),
    };
  }

  const visible = inRange(payload.rankings || []);
  const scored = allScoredVisible(payload);
  const scoredIds = new Set(scored.map((video) => video.id));
  const durationOpts = { applyLimits: getPageState().source.contentKind !== "essay" };
  const tooLong = visible.filter((video) => isTooLongForScoring(video.duration_seconds, durationOpts));
  const otherCandidates = [
    ...inRange(payload.other ?? []),
    ...visible.filter((video) => !isScoredRanking(video)),
  ];
  const otherSeen = new Set<string>();
  const other = otherCandidates.filter((video) => {
    if (scoredIds.has(video.id) || otherSeen.has(video.id)) {
      return false;
    }
    otherSeen.add(video.id);
    return true;
  });

  return { tooLong, other };
}

function renderExcludedSection(
  container: HTMLElement,
  heading: string,
  videos: RankedVideo[],
  template: HTMLTemplateElement,
  description?: string,
): void {
  if (videos.length === 0) {
    return;
  }

  const section = document.createElement("section");
  section.className = "content-section";

  const title = document.createElement("h2");
  title.className = "section-heading";
  title.textContent = heading;
  section.appendChild(title);

  if (description) {
    const lede = document.createElement("p");
    lede.className = "section-lede";
    lede.textContent = description;
    section.appendChild(lede);
  }

  const list = document.createElement("div");
  list.className = "card-list";
  const { useYoutubeThumbs, coverImage } = getPageState();

  for (const video of videos) {
    const node = template.content.cloneNode(true) as DocumentFragment;
    const card = node.querySelector<HTMLElement>(".card");
    if (!card) {
      continue;
    }
    populateExcludedCard(card, video, {
      useYoutubeThumbs,
      coverImageFallback: useYoutubeThumbs ? null : coverImage,
    });
    list.appendChild(node);
  }

  section.appendChild(list);
  container.appendChild(section);
}

function renderExcludedSections(payload: RankingsPayload): void {
  const container = document.getElementById("extra-sections");
  const template = document.getElementById("excluded-card-template") as HTMLTemplateElement | null;
  if (!container || !template) {
    return;
  }

  container.replaceChildren();

  const { tooLong, other } = excludedTalks(payload);
  const { contentLabels } = getPageState();

  renderExcludedSection(
    container,
    contentLabels.veryLong,
    tooLong,
    template,
    `These ${contentLabels.veryLong.toLowerCase()} have not been scored.`,
  );
  renderExcludedSection(
    container,
    contentLabels.other,
    other,
    template,
    contentLabels.otherLede,
  );
}

async function loadRankings(): Promise<RankingsPayload> {
  const response = await fetch(getPageState().rankingsUrl);
  if (!response.ok) {
    throw new Error(`Failed to load rankings (${response.status})`);
  }
  return response.json() as Promise<RankingsPayload>;
}

function allScoredVisible(payload: RankingsPayload): RankedVideo[] {
  const inRange = (videos: RankedVideo[]) =>
    (videos || []).filter((video) => shouldShowVideo(video.upload_date));

  const primary = inRange(payload.rankings || []).filter(isScoredRanking);
  const seen = new Set(primary.map((video) => video.id));
  const merged = [...primary];

  for (const video of inRange(payload.other || []).filter(isScoredRanking)) {
    if (!seen.has(video.id)) {
      merged.push(video);
      seen.add(video.id);
    }
  }

  return merged;
}

function renderMeta(payload: RankingsPayload): void {
  const meta = document.getElementById("meta");
  if (!meta) {
    return;
  }

  const { itemLabel } = getPageState();
  const ranked = allScoredVisible(payload);
  const filtered = ranked.filter(
    (video) =>
      meetsScoreFilter(video.composite, scoreFilterMin) &&
      meetsTimeFilter(video.upload_date, timeFilterDays),
  );
  const scoredCount = payload.scored_count ?? ranked.length;
  const pendingCount = (payload.other ?? []).filter(
    (video) => shouldShowVideo(video.upload_date) && video.status === "pending",
  ).length;
  if (ranked.length === 0 && pendingCount > 0) {
    meta.textContent = `${pendingCount} fetched ${itemLabel}, not scored yet`;
    return;
  }

  let text = "";
  if (filtered.length !== ranked.length) {
    text = `${filtered.length} ranked ${itemLabel} (from ${ranked.length})`;
  } else if (scoredCount > ranked.length) {
    text = `${ranked.length} ranked ${itemLabel} (from ${scoredCount} scored)`;
  } else {
    text = `${filtered.length} ranked ${itemLabel}`;
  }
  meta.textContent = text;
}

function renderCards(payload: RankingsPayload): void {
  const container = document.getElementById("ranked-sections");
  const template = document.getElementById("card-template") as HTMLTemplateElement | null;
  if (!container || !template) {
    return;
  }

  closeScoreBreakdown();
  container.replaceChildren();

  const ranked = sortVideos(
    allScoredVisible(payload).filter(
      (video) =>
        meetsScoreFilter(video.composite, scoreFilterMin) &&
        meetsTimeFilter(video.upload_date, timeFilterDays),
    ),
    sortMode,
  );

  if (ranked.length === 0) {
    const empty = document.createElement("div");
    empty.className = "score-filter-empty";
    empty.textContent =
      scoreFilterMin != null || timeFilterDays != null
        ? "No items match the current filters."
        : `No ranked ${getPageState().itemLabel} yet.`;
    container.appendChild(empty);
    return;
  }

  const { useYoutubeThumbs, coverImage } = getPageState();
  const cardOptions = {
    useYoutubeThumbs,
    coverImageFallback: useYoutubeThumbs ? null : coverImage,
    contentKind: getPageState().source.contentKind,
  };

  for (const video of ranked) {
    const node = template.content.cloneNode(true) as DocumentFragment;
    const card = node.querySelector<HTMLElement>(".card");
    if (!card) {
      continue;
    }

    populateRankedCard(card, video, cardOptions);
    container.appendChild(node);
  }
}

function renderError(message: string): void {
  const container = document.getElementById("ranked-sections");
  if (!container) {
    return;
  }
  container.replaceChildren();
  const error = document.createElement("div");
  error.className = "error";
  error.textContent = message;
  container.appendChild(error);
}

function rerenderRankedContent(): void {
  if (!rankingsPayload) {
    return;
  }
  renderMeta(rankingsPayload);
  renderCards(rankingsPayload);
}

async function initPage(): Promise<void> {
  mountRankedCardInteraction();
  mountFilterDropdownInteraction();

  const slug = slugFromPathname();
  if (!slug) {
    throw new Error("Missing source slug in URL");
  }

  const source = await loadPublicSourceBySlug(slug);
  pageState = {
    source,
    contentLabels: contentKindLabels(source),
    itemLabel: source.itemLabel,
    displayFilter: {
      maxDisplayAgeDays: source.maxDisplayAgeDays,
      dateRange: source.dateRange,
    },
    coverImage: source.coverImage,
    useYoutubeThumbs: source.contentKind !== "essay",
    rankingsUrl: rankingsUrlForSource(source.id),
  };

  document.title = `${source.pageTitle} — AI starred`;

  const heading = document.getElementById("page-heading");
  if (heading) {
    heading.textContent = source.pageTitle;
  }

  const payload = await loadRankings();
  rankingsPayload = payload;

  const filterContainer = document.getElementById("score-filters");
  const sortFilterContainer = document.getElementById("sort-filters");
  if (sortFilterContainer) {
    mountSortFilter(sortFilterContainer, sortMode, (mode) => {
      sortMode = mode;
      syncSortFilter(sortFilterContainer, sortMode);
      rerenderRankedContent();
    });
  }

  const timeFilterContainer = document.getElementById("time-filters");
  if (timeFilterContainer) {
    mountTimeFilter(timeFilterContainer, timeFilterDays, (days) => {
      timeFilterDays = days;
      syncTimeFilter(timeFilterContainer, timeFilterDays);
      rerenderRankedContent();
    });
  }

  if (filterContainer) {
    mountScoreFilter(filterContainer, scoreFilterMin, (min) => {
      scoreFilterMin = min;
      syncScoreFilterButtons(filterContainer, scoreFilterMin);
      rerenderRankedContent();
    });
  }

  renderMeta(payload);
  renderCards(payload);
  renderExcludedSections(payload);
}

initPage().catch((error: Error) => {
  const meta = document.getElementById("meta");
  if (meta) {
    meta.textContent = "Could not load source";
  }
  renderError(error.message);
});
