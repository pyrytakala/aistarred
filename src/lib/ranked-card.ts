import type { RankedVideo, Tag } from "../types.js";
import { positiveDimensionTags } from "./dimension-tags.js";
import { audienceLevelLabel, AUDIENCE_LEVEL_SCALE_HINT } from "./audience-level.js";
import { parseUploadDate } from "./video-age.js";
import type { ContentKind } from "./content-kind.js";
import { CONTENT_KIND_LABELS } from "./content-kind.js";
import { contentKindIconSvg } from "./content-kind-icon.js";
import { computeCompositeFromDimensions, SCORE_DIMENSIONS, SCORE_WEIGHT_TOTAL } from "./score-composite.js";
import { formatReadingTimeLabel } from "./reading-time.js";

export interface RankedCardOptions {
  useYoutubeThumbs: boolean;
  coverImageFallback?: string | null;
  showTags?: boolean;
  contentKind?: ContentKind;
  source?: {
    title: string;
    href: string;
  };
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
  useYoutubeThumbs: boolean,
  coverImageFallback?: string | null,
): void {
  if (useYoutubeThumbs) {
    thumbLink.classList.remove("thumb-link--placeholder");
    thumbLink.querySelector(".thumb-placeholder")?.remove();
    thumb.src = itemThumbnailUrl(video.id);
    thumb.alt = video.title;
    return;
  }

  if (coverImageFallback) {
    thumbLink.classList.remove("thumb-link--placeholder");
    thumbLink.querySelector(".thumb-placeholder")?.remove();
    thumb.src = coverImageFallback;
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

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
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

export function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return (Number(value) / 10).toFixed(1);
}

const SCORE_COMPONENTS = SCORE_DIMENSIONS;

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

function formatCardLengthLabel(video: RankedVideo): string | null {
  const durationLabel = formatDuration(video.duration_seconds);
  if (durationLabel) {
    return durationLabel;
  }
  return formatReadingTimeLabel(video.word_count);
}

let openScoreCard: HTMLElement | null = null;
let scoreInteractionMounted = false;

export function closeScoreBreakdown(): void {
  if (!openScoreCard) {
    return;
  }

  const scoreBtn = openScoreCard.querySelector<HTMLButtonElement>(".score");
  const breakdown = openScoreCard.querySelector<HTMLElement>(".score-breakdown");
  scoreBtn?.setAttribute("aria-expanded", "false");
  if (breakdown) {
    breakdown.hidden = true;
  }
  openScoreCard.classList.remove("card--score-open");
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
  card.classList.toggle("card--score-open", opening);
  openScoreCard = opening ? card : null;
}

function renderScoreBreakdown(breakdown: HTMLElement, video: RankedVideo): void {
  breakdown.replaceChildren();

  const title = document.createElement("p");
  title.className = "score-breakdown-title";
  title.textContent = "Score breakdown";
  breakdown.appendChild(title);

  let subtotal = 0;
  let presentWeightTotal = 0;
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
      presentWeightTotal += component.weight;
      score.textContent = Number(value).toFixed(1);
      weight.textContent = formatWeightLabel(component.weight);
      product.textContent = `= ${formatScore(contribution)}`;
    }

    row.append(label, score, weight, product);
    breakdown.appendChild(row);
  }

  const dimensionComposite = computeCompositeFromDimensions(video);
  const baseComposite = dimensionComposite ?? video.composite_base ?? null;

  const likeAdjustment = Number(video.like_adjustment ?? 0);
  const lengthAdjustment = Number(video.length_adjustment ?? 0);

  const appendAdjustRow = (label: string, value: number, formatted: string): void => {
    const adjust = document.createElement("div");
    adjust.className = "score-breakdown-adjust";
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const magnitude = formatted.replace(/^-/, "");
    adjust.innerHTML = `<span>${label}</span><span>${sign}${magnitude}</span>`;
    breakdown.appendChild(adjust);
  };

  if (baseComposite != null) {
    const normalized = document.createElement("div");
    normalized.className = "score-breakdown-adjust score-breakdown-adjust--base";
    const label =
      presentWeightTotal > 0 && presentWeightTotal < SCORE_WEIGHT_TOTAL
        ? "Weighted score (normalized)"
        : "Weighted score";
    normalized.innerHTML = `<span>${label}</span><span>${formatScore(baseComposite)}</span>`;
    breakdown.appendChild(normalized);
  }

  if (Math.abs(likeAdjustment) >= 0.5) {
    appendAdjustRow("Like adjustment", likeAdjustment, formatScore(likeAdjustment));
  }
  if (Math.abs(lengthAdjustment) >= 0.5) {
    appendAdjustRow("Length penalty", lengthAdjustment, formatScore(lengthAdjustment));
  }

  const finalComposite =
    video.composite ??
    (baseComposite != null
      ? baseComposite + likeAdjustment + lengthAdjustment
      : null);
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

export function mountRankedCardInteraction(): void {
  if (scoreInteractionMounted) {
    return;
  }
  scoreInteractionMounted = true;

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
}

const LEGACY_TAG_LABELS: Record<string, string> = {
  "Strong substance": "Substance",
  "Strong evidence": "Evidence",
  "Strong specificity": "Specificity",
  "Strong insight": "Insight",
  "Strong utility": "Utility",
  substance: "Substance",
  evidence: "Evidence",
  specificity: "Specificity",
  insight: "Insight",
  utility: "Utility",
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
  utility:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
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
    const displayLabel = tagDisplayLabel(tag.label);
    const el = document.createElement("span");
    el.className = "tag positive";
    el.setAttribute("aria-label", displayLabel);
    el.appendChild(createTagIcon(kind));
    const label = document.createElement("span");
    label.className = "tag-label";
    label.textContent = displayLabel;
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

function renderSourceLink(link: HTMLAnchorElement | null, source: RankedCardOptions["source"]): void {
  if (!link) {
    return;
  }
  if (source) {
    link.href = source.href;
    link.textContent = source.title;
    link.hidden = false;
    return;
  }
  link.hidden = true;
}

function renderContentKindBadge(badge: HTMLElement | null, contentKind: ContentKind | undefined): void {
  if (!badge) {
    return;
  }
  if (!contentKind) {
    badge.hidden = true;
    return;
  }

  badge.hidden = false;
  badge.innerHTML = contentKindIconSvg(contentKind);
  badge.title = CONTENT_KIND_LABELS[contentKind].kind;
  badge.setAttribute("aria-label", CONTENT_KIND_LABELS[contentKind].kind);
}

function cardTitlesDiffer(original: string, display: string): boolean {
  return display.trim().toLowerCase() !== original.trim().toLowerCase();
}

function renderCardTitle(titleLink: HTMLAnchorElement, video: RankedVideo): void {
  const originalTitle = video.title;
  const displayTitle = video.display_title?.trim();
  const showBoth = displayTitle && cardTitlesDiffer(originalTitle, displayTitle);

  titleLink.href = video.url ?? titleLink.href;
  titleLink.title = showBoth ? displayTitle : originalTitle;
  titleLink.textContent = showBoth ? displayTitle : originalTitle;

  let originalEl = titleLink.parentElement?.querySelector<HTMLElement>(".original-title");
  if (!originalEl) {
    originalEl = document.createElement("span");
    originalEl.className = "original-title";
    titleLink.insertAdjacentElement("afterend", originalEl);
  }

  if (showBoth) {
    originalEl.replaceChildren();
    originalEl.append("Original title: ");
    const struck = document.createElement("span");
    struck.className = "original-title-text";
    struck.textContent = originalTitle;
    originalEl.append(struck);
    originalEl.hidden = false;
  } else {
    originalEl.replaceChildren();
    originalEl.hidden = true;
  }
}

export function populateRankedCard(
  card: HTMLElement,
  video: RankedVideo,
  options: RankedCardOptions,
): void {
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
  const sourceLink = card.querySelector<HTMLAnchorElement>(".feed-source-link");
  const contentKindBadge = card.querySelector<HTMLElement>(".card-kind");

  if (
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

  if (cardTags && options.showTags !== false) {
    renderTags(cardTags, positiveTags(video));
  } else if (cardTags) {
    cardTags.hidden = true;
  }

  setupScoreButton(card, score, scoreBreakdown, video);
  applyThumbnail(thumbLink, thumb, video, options.useYoutubeThumbs, options.coverImageFallback);
  renderContentKindBadge(contentKindBadge, options.contentKind);
  thumbLink.href = video.url;

  const durationLabel = formatCardLengthLabel(video);
  if (durationLabel) {
    duration.textContent = durationLabel;
    duration.hidden = false;
  } else {
    duration.textContent = "";
    duration.hidden = true;
  }

  titleLink.href = video.url;
  renderCardTitle(titleLink, video);

  renderSummary(summaryWrap, video.summary_bullets);
  summaryWrap.hidden = !(video.summary_bullets || []).length;

  renderTalkMeta(video, audienceLevel, published);
  renderSourceLink(sourceLink, options.source);
}

export function cloneRankedCard(
  template: HTMLTemplateElement,
  video: RankedVideo,
  options: RankedCardOptions,
): HTMLElement | null {
  const node = template.content.cloneNode(true) as DocumentFragment;
  const card = node.querySelector<HTMLElement>(".card");
  if (!card) {
    return null;
  }
  populateRankedCard(card, video, options);
  return card;
}

export function populateExcludedCard(
  card: HTMLElement,
  video: RankedVideo,
  options: Pick<RankedCardOptions, "useYoutubeThumbs" | "coverImageFallback">,
): void {
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
  applyThumbnail(thumbLink, thumb, video, options.useYoutubeThumbs, options.coverImageFallback);
  thumbLink.href = video.url;

  const durationLabel = formatCardLengthLabel(video);
  if (durationLabel) {
    duration.textContent = durationLabel;
    duration.hidden = false;
  } else {
    duration.textContent = "";
    duration.hidden = true;
  }

  titleLink.href = video.url;
  renderCardTitle(titleLink, video);

  if (summaryWrap) {
    renderSummary(summaryWrap, video.summary_bullets);
    summaryWrap.hidden = !(video.summary_bullets || []).length;
  }

  renderTalkMeta(video, audienceLevel, published);
}
