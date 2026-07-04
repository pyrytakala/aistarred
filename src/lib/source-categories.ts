/**
 * MECE topic categories for sources (inspired by podcast/app store groupings).
 * Each source has one primary category for UI grouping; `categories` may list
 * secondary tags when a source genuinely spans topics.
 */

export const SOURCE_CATEGORY_IDS = [
  "ai-ml",
  "software",
  "startups",
  "finance",
  "science-health",
  "industry",
] as const;

export type SourceCategoryId = (typeof SOURCE_CATEGORY_IDS)[number];

export interface SourceCategory {
  id: SourceCategoryId;
  label: string;
}

export const SOURCE_CATEGORIES: SourceCategory[] = [
  { id: "ai-ml", label: "AI & ML" },
  { id: "software", label: "Software engineering" },
  { id: "startups", label: "Startups & product" },
  { id: "finance", label: "Finance & markets" },
  { id: "science-health", label: "Science & health" },
  { id: "industry", label: "Industry & infra" },
];

const CATEGORY_LABELS = Object.fromEntries(
  SOURCE_CATEGORIES.map((category) => [category.id, category.label]),
) as Record<SourceCategoryId, string>;

/** Primary category — each source appears once in the filter tree. */
export const SOURCE_PRIMARY_CATEGORY: Record<string, SourceCategoryId> = {
  "ai-engineer-worlds-fair-2026": "ai-ml",
  "latent-space-pod-q2-2026": "ai-ml",
  "no-priors-pod-q2-2026": "startups",
  "twiml-ai-pod-q2-2026": "ai-ml",
  "cognitive-revolution-pod-q2-2026": "ai-ml",
  "nvidia-q2-2026": "industry",
  "a16z-q2-2026": "startups",
  "ml-street-talk-q2-2026": "ai-ml",
  "huberman-lab-h1-2026": "science-health",
  "paul-graham-essays-2020s": "startups",
  "swyx-io-2026": "ai-ml",
  "gwern-blog-2025-2026": "science-health",
  "simon-willison-h1-2026": "ai-ml",
  "anthropic-engineering-h1-2026": "ai-ml",
  "openai-developer-blog-h1-2026": "ai-ml",
  "stratechery-h1-2026": "startups",
  "import-ai-h1-2026": "ai-ml",
  "hamel-dev-h1-2026": "ai-ml",
  "machine-theory-journal-h1-2026": "ai-ml",
  "semianalysis-q2-2026": "industry",
  "bens-bites-q2-2026": "ai-ml",
  "pragmatic-engineer-2026": "software",
  "construction-physics-q2-2026": "industry",
  "asterisk-issue-14-latest": "science-health",
  "odd-lots-q2-2026": "finance",
  "yc-startup-pod-q2-2026": "startups",
  "my-first-million-q2-2026": "startups",
  "pmf-show-q2-2026": "startups",
  "how-i-built-this-q2-2026": "startups",
  "lennys-podcast-q2-2026": "startups",
  "nateliason-q2-2026": "startups",
  "founders-podcast-q2-2026": "startups",
  "peter-attia-q2-2026": "science-health",
  "modern-wisdom-q2-2026": "science-health",
  "greg-isenberg-q2-2026": "startups",
  "iltb-podcast-q2-2026": "finance",
  "cal-newport-2026": "startups",
  "kenji-lopez-alt-2026": "science-health",
  "morgan-housel-2026": "finance",
  "ramit-sethi-2026": "finance",
  "ten-percent-happier-2026": "science-health",
  "happiness-lab-2026": "science-health",
  "good-inside-2026": "science-health",
  "raising-good-humans-2026": "science-health",
  "emily-oster-2026": "science-health",
  "barbell-medicine-2026": "science-health",
  "david-burns-2026": "science-health",
  "tim-ferriss-2026": "startups",
  "ali-abdaal-2026": "startups",
};

/** All topic tags — used when toggling a category header affects related sources. */
export const SOURCE_CATEGORY_TAGS: Record<string, SourceCategoryId[]> = {
  "ai-engineer-worlds-fair-2026": ["ai-ml"],
  "latent-space-pod-q2-2026": ["ai-ml"],
  "no-priors-pod-q2-2026": ["startups", "ai-ml"],
  "twiml-ai-pod-q2-2026": ["ai-ml"],
  "cognitive-revolution-pod-q2-2026": ["ai-ml"],
  "nvidia-q2-2026": ["industry", "ai-ml"],
  "a16z-q2-2026": ["startups", "finance"],
  "ml-street-talk-q2-2026": ["ai-ml"],
  "huberman-lab-h1-2026": ["science-health"],
  "paul-graham-essays-2020s": ["startups"],
  "swyx-io-2026": ["ai-ml", "software"],
  "gwern-blog-2025-2026": ["science-health"],
  "simon-willison-h1-2026": ["ai-ml", "software"],
  "anthropic-engineering-h1-2026": ["ai-ml"],
  "openai-developer-blog-h1-2026": ["ai-ml"],
  "stratechery-h1-2026": ["startups"],
  "import-ai-h1-2026": ["ai-ml"],
  "hamel-dev-h1-2026": ["ai-ml"],
  "machine-theory-journal-h1-2026": ["ai-ml"],
  "semianalysis-q2-2026": ["industry", "finance"],
  "bens-bites-q2-2026": ["ai-ml"],
  "pragmatic-engineer-2026": ["software"],
  "construction-physics-q2-2026": ["industry"],
  "asterisk-issue-14-latest": ["science-health"],
  "odd-lots-q2-2026": ["finance"],
  "yc-startup-pod-q2-2026": ["startups"],
  "my-first-million-q2-2026": ["startups"],
  "pmf-show-q2-2026": ["startups"],
  "how-i-built-this-q2-2026": ["startups"],
  "lennys-podcast-q2-2026": ["startups"],
  "nateliason-q2-2026": ["startups"],
  "founders-podcast-q2-2026": ["startups"],
  "peter-attia-q2-2026": ["science-health"],
  "modern-wisdom-q2-2026": ["science-health"],
  "greg-isenberg-q2-2026": ["startups"],
  "iltb-podcast-q2-2026": ["finance", "startups"],
  "cal-newport-2026": ["startups"],
  "kenji-lopez-alt-2026": ["science-health"],
  "morgan-housel-2026": ["finance", "startups"],
  "ramit-sethi-2026": ["finance"],
  "ten-percent-happier-2026": ["science-health"],
  "happiness-lab-2026": ["science-health"],
  "good-inside-2026": ["science-health"],
  "raising-good-humans-2026": ["science-health"],
  "emily-oster-2026": ["science-health"],
  "barbell-medicine-2026": ["science-health"],
  "david-burns-2026": ["science-health"],
  "tim-ferriss-2026": ["startups"],
  "ali-abdaal-2026": ["startups"],
};

export function primaryCategoryForSource(sourceId: string): SourceCategoryId {
  return SOURCE_PRIMARY_CATEGORY[sourceId] ?? "ai-ml";
}

export function categoriesForSource(sourceId: string): SourceCategoryId[] {
  const tags = SOURCE_CATEGORY_TAGS[sourceId];
  if (tags?.length) {
    return [...tags];
  }
  return [primaryCategoryForSource(sourceId)];
}

export function categoryLabel(categoryId: SourceCategoryId): string {
  return CATEGORY_LABELS[categoryId];
}

export function sourcesInCategory(
  sourceIds: string[],
  categoryId: SourceCategoryId,
): string[] {
  return sourceIds.filter((id) => categoriesForSource(id).includes(categoryId));
}
