import "./styles.css";
import type { RankedVideo, RankingsPayload, Tag } from "./types";
import type { ContentKind } from "./lib/content-kind.js";
import { shouldDisplayVideo } from "./lib/source-filter.js";
import { parseUploadDate } from "./lib/video-age.js";
import { groupByScoreBand, isScoredRanking } from "./lib/score-bands.js";
import { isTooLongForScoring } from "./lib/scoring-limits.js";
import { positiveDimensionTags } from "./lib/dimension-tags.js";
import { audienceLevelLabel, AUDIENCE_LEVEL_SCALE_HINT } from "./lib/audience-level.js";
import { contentKindLabels, type PublicSource } from "./lib/public-source.js";
import {
  loadPublicSourceBySlug,
  rankingsUrlForSource,
  slugFromPathname,
} from "./lib/sources-manifest.js";

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

function getPageState(): PageState {
  if (!pageState) {
    throw new Error("Page state not initialized");
  }
  return pageState;
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

function applyThumbnail(
  thumbLink: HTMLAnchorElement,
  thumb: HTMLImageElement,
  video: RankedVideo,
): void {
  const { useYoutubeThumbs } = getPageState();

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
  return shouldDisplayVideo(uploadDate, getPageState().displayFilter);
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
      product.textContent = `= ${formatScore(contribution)}`;
    }

    row.append(label, score, weight, product);
    breakdown.appendChild(row);
  }

  const appendAdjustRow = (label: string, value: number, formatted: string): void => {
    const adjust = document.createElement("div");
    adjust.className = "score-breakdown-adjust";
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const magnitude = formatted.replace(/^-/, "");
    adjust.innerHTML = `<span>${label}</span><span>${sign}${magnitude}</span>`;
    breakdown.appendChild(adjust);
  };

  const likeAdjustment = Number(video.like_adjustment ?? 0);
  const lengthAdjustment = Number(video.length_adjustment ?? 0);

  if (Math.abs(likeAdjustment) >= 0.5) {
    appendAdjustRow("Like adjustment", likeAdjustment, formatScore(likeAdjustment));
  }
  if (Math.abs(lengthAdjustment) >= 0.5) {
    appendAdjustRow("Length penalty", lengthAdjustment, formatScore(lengthAdjustment));
  }

  const finalComposite = video.composite ?? video.composite_base ?? subtotal;
  const total = document.createElement("div");
  total.className = "score-breakdown-total";
  total.innerHTML = `<span>Total</span><span>${formatScore(finalComposite)}</span>`;
  breakdown.appendChild(total);

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

const LEGACY_TAG_LABELS: Record<string, string> = {
  "Strong substance": "Substance",
  "Strong evidence": "Evidence",
  "Strong specificity": "Specificity",
  "Strong insight": "Insight",
  substance: "Substance",
  evidence: "Evidence",
  specificity: "Specificity",
  insight: "Insight",
};

function tagDisplayLabel(label: string): string {
  return LEGACY_TAG_LABELS[label] ?? label;
}

function tagIconKind(label: string): string {
  const display = tagDisplayLabel(label);
  if (display === "Non-promo") {
    return "neutral";
  }
  return display.toLowerCase();
}

const TAG_ICON_SVGS: Record<string, string> = {
  substance:
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  evidence: '<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>',
  specificity:
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  insight:
    '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13.5 11H20a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 10.5 14z"/>',
  neutral:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
};

function createTagIcon(kind: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("tag-icon");
  svg.innerHTML = TAG_ICON_SVGS[kind] || TAG_ICON_SVGS.substance;
  return svg;
}

function positiveTags(video: RankedVideo): Tag[] {
  const tags = video.tags ?? positiveDimensionTags(video);
  return tags.filter((tag) => (tag.tone || "positive") === "positive");
}

function renderTags(container: HTMLElement, tags: Tag[]): void {
  container.replaceChildren();

  for (const tag of tags) {
    const kind = tagIconKind(tag.label);
    const el = document.createElement("span");
    el.className = "tag positive";
    el.appendChild(createTagIcon(kind));
    const label = document.createElement("span");
    label.className = "tag-label";
    label.textContent = tagDisplayLabel(tag.label);
    el.appendChild(label);
    container.appendChild(el);
  }

  container.hidden = container.childElementCount === 0;
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

function ensureAudienceLevelTooltip(): HTMLDivElement {
  let tooltip = document.getElementById("audience-level-tooltip") as HTMLDivElement | null;
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "audience-level-tooltip";
    tooltip.hidden = true;
    tooltip.textContent = AUDIENCE_LEVEL_SCALE_HINT;
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showAudienceLevelTooltip(wrap: HTMLElement): void {
  const badge = wrap.querySelector<HTMLElement>(".audience-level");
  if (!badge) {
    return;
  }

  const tooltip = ensureAudienceLevelTooltip();
  tooltip.hidden = false;
  tooltip.style.visibility = "hidden";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";

  const badgeRect = badge.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const margin = 8;
  const gap = 6;

  let top = badgeRect.bottom + gap;
  let left = badgeRect.right - tipRect.width;

  if (top + tipRect.height > window.innerHeight - margin) {
    top = badgeRect.top - tipRect.height - gap;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.visibility = "visible";
}

function hideAudienceLevelTooltip(): void {
  const tooltip = document.getElementById("audience-level-tooltip");
  if (tooltip) {
    tooltip.hidden = true;
    tooltip.style.visibility = "";
  }
}

function setupAudienceLevelTooltip(wrap: HTMLElement): void {
  if (wrap.dataset.tooltipBound === "true") {
    return;
  }
  wrap.dataset.tooltipBound = "true";

  wrap.addEventListener("mouseenter", () => showAudienceLevelTooltip(wrap));
  wrap.addEventListener("mouseleave", hideAudienceLevelTooltip);
  wrap.addEventListener("focusin", () => showAudienceLevelTooltip(wrap));
  wrap.addEventListener("focusout", (event) => {
    if (!wrap.contains(event.relatedTarget as Node | null)) {
      hideAudienceLevelTooltip();
    }
  });
}

function renderTalkMeta(video: RankedVideo, levelEl: HTMLElement | null, published: HTMLTimeElement | null): void {
  const label = audienceLevelLabel(video.audience_level);
  const wrap = levelEl?.closest<HTMLElement>(".audience-level-wrap");

  if (levelEl && wrap) {
    if (label) {
      levelEl.textContent = label;
      wrap.hidden = false;
      setupAudienceLevelTooltip(wrap);
    } else {
      levelEl.textContent = "";
      wrap.hidden = true;
    }
  }

  if (!published) {
    return;
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
}

function populateExcludedCard(card: HTMLElement, video: RankedVideo): void {
  const duration = card.querySelector<HTMLElement>(".duration");
  const thumbLink = card.querySelector<HTMLAnchorElement>(".thumb-link");
  const thumb = card.querySelector<HTMLImageElement>(".thumb");
  const titleLink = card.querySelector<HTMLAnchorElement>(".title-link");
  const summaryWrap = card.querySelector<HTMLElement>(".summary-wrap");
  const audienceLevel = card.querySelector<HTMLElement>(".audience-level");
  const published = card.querySelector<HTMLTimeElement>(".published");

  if (!thumbLink || !thumb || !duration || !titleLink || !published || !video.url) {
    return;
  }

  card.dataset.videoId = video.id;

  applyThumbnail(thumbLink, thumb, video);
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

  if (summaryWrap) {
    renderSummary(summaryWrap, video.summary_bullets);
    summaryWrap.hidden = !(video.summary_bullets || []).length;
  }

  renderTalkMeta(video, audienceLevel, published);
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

  for (const video of videos) {
    const node = template.content.cloneNode(true) as DocumentFragment;
    const card = node.querySelector<HTMLElement>(".card");
    if (!card) {
      continue;
    }
    populateExcludedCard(card, video);
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

function populateCard(card: HTMLElement, video: RankedVideo): void {
  const duration = card.querySelector<HTMLElement>(".duration");
  const thumbLink = card.querySelector<HTMLAnchorElement>(".thumb-link");
  const thumb = card.querySelector<HTMLImageElement>(".thumb");
  const cardTags = card.querySelector<HTMLElement>(".card-tags");
  const titleLink = card.querySelector<HTMLAnchorElement>(".title-link");
  const summaryWrap = card.querySelector<HTMLElement>(".summary-wrap");
  const audienceLevel = card.querySelector<HTMLElement>(".audience-level");
  const published = card.querySelector<HTMLTimeElement>(".published");
  const score = card.querySelector<HTMLButtonElement>(".score");
  const scoreBreakdown = card.querySelector<HTMLElement>(".score-breakdown");

  if (
    !thumbLink ||
    !thumb ||
    !duration ||
    !cardTags ||
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
  renderTags(cardTags, positiveTags(video));
  setupScoreButton(card, score, scoreBreakdown, video);

  applyThumbnail(thumbLink, thumb, video);
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

  renderTalkMeta(video, audienceLevel, published);
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

  return merged.sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
}

function renderMeta(payload: RankingsPayload): void {
  const meta = document.getElementById("meta");
  if (!meta) {
    return;
  }

  const { itemLabel } = getPageState();
  const ranked = allScoredVisible(payload);
  const scoredCount = payload.scored_count ?? ranked.length;
  const pendingCount = (payload.other ?? []).filter(
    (video) => shouldShowVideo(video.upload_date) && video.status === "pending",
  ).length;

  if (ranked.length === 0 && pendingCount > 0) {
    meta.textContent = `${pendingCount} fetched ${itemLabel}, not scored yet`;
  } else if (scoredCount > ranked.length) {
    meta.textContent = `${ranked.length} ranked ${itemLabel} (from ${scoredCount} scored)`;
  } else {
    meta.textContent = `${ranked.length} ranked ${itemLabel}`;
  }
}

function renderCards(payload: RankingsPayload): void {
  const container = document.getElementById("ranked-sections");
  const template = document.getElementById("card-template") as HTMLTemplateElement | null;
  if (!container || !template) {
    return;
  }

  container.replaceChildren();

  const sections = groupByScoreBand(allScoredVisible(payload));
  for (const { band, videos } of sections) {
    const section = document.createElement("section");
    section.className = "score-band-section";

    const heading = document.createElement("h2");
    heading.className = "section-heading score-band-heading";
    heading.textContent = band.label;
    section.appendChild(heading);

    const list = document.createElement("div");
    list.className = "card-list";

    for (const video of videos) {
      const node = template.content.cloneNode(true) as DocumentFragment;
      const card = node.querySelector<HTMLElement>(".card");
      if (!card) {
        continue;
      }

      populateCard(card, video);
      list.appendChild(node);
    }

    section.appendChild(list);
    container.appendChild(section);
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

async function initPage(): Promise<void> {
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
