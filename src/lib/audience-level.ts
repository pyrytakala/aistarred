export const AUDIENCE_LEVELS = ["general", "practitioner", "professional", "specialist"] as const;

export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];

export const AUDIENCE_LEVEL_LABELS: Record<AudienceLevel, string> = {
  general: "General",
  practitioner: "Practitioner",
  professional: "Professional",
  specialist: "Specialist",
};

const ALIASES: Record<string, AudienceLevel> = {
  general: "general",
  "general public": "general",
  beginner: "general",
  introductory: "general",
  public: "general",
  practitioner: "practitioner",
  intermediate: "practitioner",
  applied: "practitioner",
  professional: "professional",
  specialist: "specialist",
  expert: "specialist",
  "expert specialist": "specialist",
};

export function normalizeAudienceLevel(value: string | null | undefined): AudienceLevel | null {
  if (!value) {
    return null;
  }

  const key = value.trim().toLowerCase();
  if (key in ALIASES) {
    return ALIASES[key];
  }

  return AUDIENCE_LEVELS.includes(key as AudienceLevel) ? (key as AudienceLevel) : null;
}

export function audienceLevelLabel(level: AudienceLevel | string | null | undefined): string | null {
  const normalized =
    typeof level === "string" && AUDIENCE_LEVELS.includes(level as AudienceLevel)
      ? (level as AudienceLevel)
      : normalizeAudienceLevel(level);
  return normalized ? AUDIENCE_LEVEL_LABELS[normalized] : null;
}

/** Shown on hover over any audience-level badge. One level per line. */
export const AUDIENCE_LEVEL_SCALE_HINT = [
  "General — no prior knowledge needed",
  "Practitioner — needs field basics",
  "Professional — for working practitioners",
  "Specialist — subfield experts only",
].join("\n");
