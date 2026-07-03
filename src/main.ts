import "./styles.css";
import type { RankedVideo, RankingsPayload } from "./types";
import { shouldDisplayVideo } from "./lib/source-filter.js";
import { parseUploadDate } from "./lib/video-age.js";
import { isScoredRanking, selectTopPicks } from "./lib/top-picks.js";

const SOURCE_ID = document.body.dataset.sourceId ?? "ai-engineer-worlds-fair-2026";
const ITEM_LABEL = document.body.dataset.itemLabel ?? "videos";
const DISPLAY_FILTER = {
  maxDisplayAgeDays: document.body.dataset.maxDisplayAgeDays
    ? Number(document.body.dataset.maxDisplayAgeDays)
    : null,
  dateRange:
    document.body.dataset.dateSince && document.body.dataset.dateUntil
      ? {
          since: document.body.dataset.dateSince,
          until: document.body.dataset.dateUntil,
        }
      : undefined,
};

const RANKINGS_URL = import.meta.env.DEV
  ? `/api/rankings/${SOURCE_ID}`
  : `${import.meta.env.BASE_URL}data/${SOURCE_ID}/rankings.json`;

function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

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

const SCORE_COMPONENTS = [
  { key: "substance", label: "Substance", weight: 3 },
  { key: "evidence", label: "Evidence", weight: 2 },
  { key: "specificity", label: "Specificity", weight: 1.5 },
  { key: "insight_density", label: "Insight", weight: 2.5 },
  { key: "non_promotion", label: "Non-promo", weight: 1 },
] as const;

const SCORE_WEIGHT_TOTAL = SCORE_COMPONENTS.reduce((sum, component) => sum + component.weight, 0);

function shouldShowVideo(uploadDate: string | null | undefined): boolean {
  return shouldDisplayVideo(uploadDate, DISPLAY_FILTER);
}

function formatWeightPercent(weight: number): string {
  return `${Math.round((weight / SCORE_WEIGHT_TOTAL) * 100)}%`;
}

function formatWeightLabel(weight: number): string {
  return `× ${formatWeightPercent(weight)}`;
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

let openScoreCard: HTMLElement | null = null;

function closeScoreBreakdown(): void {
  if (!openScoreCard) {
    return;
  }

  const scoreBtn = openScoreCard.querySelector<HTMLButtonElement>(".score");
  const breakdown = openScoreCard.querySelector<HTMLElement>(".score-breakdown");
  scoreBtn?.setAttribute("aria-expanded", "false");
  if (breakdown) {
    breakdown.hidden = true;
  }
  openScoreCard = null;
}

function toggleScoreBreakdown(
  card: HTMLElement,
  scoreBtn: HTMLButtonElement,
  breakdown: HTMLElement,
): void {
  if (openScoreCard && openScoreCard !== card) {
    closeScoreBreakdown();
  }

  const opening = breakdown.hidden;
  breakdown.hidden = !opening;
  scoreBtn.setAttribute("aria-expanded", opening ? "true" : "false");
  openScoreCard = opening ? card : null;
}

function renderScoreBreakdown(breakdown: HTMLElement, video: RankedVideo): void {
  breakdown.replaceChildren();

  const title = document.createElement("p");
  title.className = "score-breakdown-title";
  title.textContent = "Score breakdown";
  breakdown.appendChild(title);

  let subtotal = 0;
  for (const component of SCORE_COMPONENTS) {
    const value = video[component.key];
    const row = document.createElement("div");
    row.className = "score-breakdown-row";

    const label = document.createElement("span");
    label.className = "score-breakdown-label";
    label.textContent = component.label;

    const score = document.createElement("span");
    score.className = "score-breakdown-value";
    const weight = document.createElement("span");
    weight.className = "score-breakdown-weight";
    const product = document.createElement("span");
    product.className = "score-breakdown-product";

    if (value == null || Number.isNaN(value)) {
      score.textContent = "—";
      weight.textContent = formatWeightLabel(component.weight);
      product.textContent = "—";
    } else {
      const contribution = Number(value) * component.weight;
      subtotal += contribution;
      score.textContent = Number(value).toFixed(1);
      weight.textContent = formatWeightLabel(component.weight);
      product.textContent = `= ${contribution.toFixed(1)}`;
    }

    row.append(label, score, weight, product);
    breakdown.appendChild(row);
  }

  const base = video.composite_base ?? video.composite ?? subtotal;
  const total = document.createElement("div");
  total.className = "score-breakdown-total";
  total.innerHTML = `<span>Total</span><span>${Number(base).toFixed(1)} / 100</span>`;
  breakdown.appendChild(total);

  const likeAdjustment = video.like_adjustment;
  if (likeAdjustment != null && Math.abs(Number(likeAdjustment)) > 0.01) {
    const adjust = document.createElement("div");
    adjust.className = "score-breakdown-adjust";
    const sign = Number(likeAdjustment) > 0 ? "+" : "";
    adjust.innerHTML = `<span>Like adjustment</span><span>${sign}${Number(likeAdjustment).toFixed(1)}</span>`;
    breakdown.appendChild(adjust);

    const finalRow = document.createElement("div");
    finalRow.className = "score-breakdown-total";
    finalRow.innerHTML = `<span>Final</span><span>${formatScore(video.composite)}</span>`;
    breakdown.appendChild(finalRow);
  }

  breakdown.hidden = true;
}

function setupScoreButton(
  card: HTMLElement,
  scoreBtn: HTMLButtonElement,
  breakdown: HTMLElement,
  video: RankedVideo,
): void {
  renderScoreBreakdown(breakdown, video);
  scoreBtn.textContent = formatScore(video.composite);
  scoreBtn.setAttribute("aria-label", `Score ${formatScore(video.composite)}. Show breakdown`);

  scoreBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleScoreBreakdown(card, scoreBtn, breakdown);
  });
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (!target.closest(".score") && !target.closest(".score-breakdown")) {
    closeScoreBreakdown();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeScoreBreakdown();
  }
});

function groupCardsByRow(cards: HTMLElement[]): HTMLElement[][] {
  const rows: HTMLElement[][] = [];
  for (const card of cards) {
    const top = card.offsetTop;
    const row = rows.find((group) => Math.abs(group[0].offsetTop - top) < 2);
    if (row) {
      row.push(card);
    } else {
      rows.push([card]);
    }
  }
  return rows;
}

function balanceCardRows(): void {
  const cards = [...document.querySelectorAll<HTMLElement>(".card")];
  cards.forEach((card) => {
    card.style.height = "";
    card.classList.remove("is-measuring");
  });

  const collapsed = cards.filter((card) => !card.classList.contains("is-expanded"));
  collapsed.forEach((card) => card.classList.add("is-measuring"));

  for (const row of groupCardsByRow(collapsed)) {
    const tallest = Math.max(...row.map((card) => card.offsetHeight));
    for (const card of row) {
      card.style.height = `${tallest}px`;
    }
  }

  collapsed.forEach((card) => card.classList.remove("is-measuring"));
  refreshAllSummaryStates();
}

function refreshAllSummaryStates(): void {
  for (const wrap of document.querySelectorAll<HTMLElement>(".summary-wrap:not([hidden])")) {
    updateSummaryToggleState(wrap);
  }
}

let expandedVideoId: string | null = null;

function collapseExpandedCard(): void {
  if (!expandedVideoId) {
    return;
  }

  const card = document.querySelector<HTMLElement>(`.card[data-video-id="${expandedVideoId}"]`);
  if (card) {
    card.classList.remove("is-expanded");
    card.style.height = "";
    const wrap = card.querySelector<HTMLElement>(".summary-wrap");
    if (wrap) {
      updateSummaryToggleState(wrap);
    }
  }
  expandedVideoId = null;
  balanceCardRows();
}

function expandCard(card: HTMLElement, videoId: string): void {
  collapseExpandedCard();
  card.classList.add("is-expanded");
  card.style.height = "";
  expandedVideoId = videoId;
  const wrap = card.querySelector<HTMLElement>(".summary-wrap");
  if (wrap) {
    updateSummaryToggleState(wrap);
  }
  balanceCardRows();
}

function updateSummaryToggleState(wrap: HTMLElement): void {
  const card = wrap.closest<HTMLElement>(".card");
  if (!card) {
    return;
  }

  const panel = wrap.querySelector<HTMLElement>(".summary-panel");
  const moreBtn = wrap.querySelector<HTMLButtonElement>(".summary-more");
  const lessBtn = card.querySelector<HTMLButtonElement>(".summary-less");
  const expanded = card.classList.contains("is-expanded");

  if (!panel || !moreBtn || !lessBtn) {
    return;
  }

  if (expanded) {
    wrap.classList.add("has-overflow");
    moreBtn.hidden = true;
    lessBtn.hidden = false;
    return;
  }

  const needsToggle = panel.scrollHeight > panel.clientHeight + 1;
  wrap.classList.toggle("has-overflow", needsToggle);
  moreBtn.hidden = !needsToggle;
  lessBtn.hidden = true;
}

function setupSummaryInteractions(card: HTMLElement, wrap: HTMLElement, videoId: string): void {
  const panel = wrap.querySelector<HTMLElement>(".summary-panel");
  const moreBtn = wrap.querySelector<HTMLButtonElement>(".summary-more");
  const lessBtn = card.querySelector<HTMLButtonElement>(".summary-less");
  if (!panel || !moreBtn || !lessBtn) {
    return;
  }

  const expand = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (card.classList.contains("is-expanded")) {
      return;
    }
    expandCard(card, videoId);
  };

  const collapse = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    card.classList.remove("is-expanded");
    if (expandedVideoId === videoId) {
      expandedVideoId = null;
    }
    updateSummaryToggleState(wrap);
    balanceCardRows();
  };

  panel.addEventListener("click", expand);
  moreBtn.addEventListener("click", expand);
  lessBtn.addEventListener("click", collapse);
}

function renderSummary(wrap: HTMLElement, bullets: string[] | undefined): void {
  const list = wrap.querySelector<HTMLElement>(".summary");
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const bullet of bullets || []) {
    const item = document.createElement("li");
    item.textContent = bullet;
    list.appendChild(item);
  }
}

function populateCard(
  card: HTMLElement,
  video: RankedVideo,
  options: {
    rank?: number;
  },
): void {
  const rank = card.querySelector<HTMLElement>(".rank");
  const duration = card.querySelector<HTMLElement>(".duration");
  const thumbLink = card.querySelector<HTMLAnchorElement>(".thumb-link");
  const thumb = card.querySelector<HTMLImageElement>(".thumb");
  const titleLink = card.querySelector<HTMLAnchorElement>(".title-link");
  const summaryWrap = card.querySelector<HTMLElement>(".summary-wrap");
  const published = card.querySelector<HTMLTimeElement>(".published");
  const score = card.querySelector<HTMLButtonElement>(".score");
  const scoreBreakdown = card.querySelector<HTMLElement>(".score-breakdown");

  if (
    !rank ||
    !thumbLink ||
    !thumb ||
    !duration ||
    !titleLink ||
    !summaryWrap ||
    !published ||
    !score ||
    !scoreBreakdown ||
    !video.url
  ) {
    return;
  }

  card.dataset.videoId = video.id;
  rank.textContent = `#${options.rank ?? video.rank}`;
  setupScoreButton(card, score, scoreBreakdown, video);

  thumb.src = thumbnailUrl(video.id);
  thumb.alt = video.title;
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

  renderSummary(summaryWrap, video.summary_bullets);
  summaryWrap.hidden = !(video.summary_bullets || []).length;
  setupSummaryInteractions(card, summaryWrap, video.id);

  const uploadDate = parseUploadDate(video.upload_date);
  if (uploadDate) {
    published.hidden = false;
    published.dateTime = video.upload_date ?? "";
    published.title = formatAbsoluteDate(uploadDate);
    published.textContent = formatRelativeDate(video.upload_date);
  } else {
    published.hidden = true;
  }
}

async function loadRankings(): Promise<RankingsPayload> {
  const response = await fetch(RANKINGS_URL);
  if (!response.ok) {
    throw new Error(`Failed to load rankings (${response.status})`);
  }
  return response.json() as Promise<RankingsPayload>;
}

function visiblePicks(payload: RankingsPayload): RankedVideo[] {
  const inRange = (payload.rankings || []).filter((video) =>
    shouldShowVideo(video.upload_date),
  );
  const picks = inRange.filter(isScoredRanking);
  if (picks.length > 0) {
    return picks;
  }
  return selectTopPicks(inRange);
}

function renderMeta(payload: RankingsPayload): void {
  const meta = document.getElementById("meta");
  if (!meta) {
    return;
  }

  const picks = visiblePicks(payload);
  const scoredCount = payload.scored_count ?? picks.length;
  meta.replaceChildren();

  const prefix = document.createElement("span");
  if (scoredCount > picks.length) {
    prefix.textContent = `${picks.length} top ${ITEM_LABEL} (from ${scoredCount} scored) · `;
  } else {
    prefix.textContent = `${picks.length} top ${ITEM_LABEL} · `;
  }

  const qualityLink = document.createElement("a");
  qualityLink.className = "quality-link";
  qualityLink.href = "/how-it-works/";
  qualityLink.textContent = "how it works";

  meta.append(prefix, qualityLink);
}

function renderCards(payload: RankingsPayload): void {
  const grid = document.getElementById("grid");
  const template = document.getElementById("card-template") as HTMLTemplateElement | null;
  if (!grid || !template) {
    return;
  }

  grid.replaceChildren();

  const picks = visiblePicks(payload);

  picks.forEach((video, index) => {
    const node = template.content.cloneNode(true) as DocumentFragment;
    const card = node.querySelector<HTMLElement>(".card");
    if (!card) {
      return;
    }

    populateCard(card, video, { rank: index + 1 });
    grid.appendChild(node);
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(balanceCardRows);
  });

  for (const img of grid.querySelectorAll<HTMLImageElement>(".thumb")) {
    if (!img.complete) {
      img.addEventListener("load", balanceCardRows, { once: true });
    }
  }
}

function renderError(message: string): void {
  const grid = document.getElementById("grid");
  if (!grid) {
    return;
  }
  grid.replaceChildren();
  const error = document.createElement("div");
  error.className = "error";
  error.textContent = message;
  grid.appendChild(error);
}

loadRankings()
  .then((payload) => {
    renderMeta(payload);
    renderCards(payload);
  })
  .catch((error: Error) => {
    const meta = document.getElementById("meta");
    if (meta) {
      meta.textContent = "Could not load rankings";
    }
    renderError(error.message);
  });

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(balanceCardRows, 100);
});
