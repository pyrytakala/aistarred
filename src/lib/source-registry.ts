/**
 * Dev-only catalog of which content sources are included or deliberately excluded.
 * Not surfaced in the UI — update this when adding or declining a source.
 *
 * Runtime config lives in `sources-config.ts`; this file is the decision log.
 */

export type IncludedSourceEntry = {
  status: "included";
  id: string;
  note?: string;
};

export type ExcludedSourceEntry = {
  status: "excluded";
  id: string;
  label: string;
  reason: string;
  channelHandle?: string;
};

export type SourceRegistryEntry = IncludedSourceEntry | ExcludedSourceEntry;

/** Inclusion/exclusion decisions for AI starred sources. */
export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    status: "included",
    id: "ai-engineer-worlds-fair-2026",
    note: "Conference; 10-day display window after upload.",
  },
  {
    status: "included",
    id: "latent-space-pod-q2-2026",
  },
  {
    status: "included",
    id: "no-priors-pod-q2-2026",
  },
  {
    status: "included",
    id: "twiml-ai-pod-q2-2026",
  },
  {
    status: "included",
    id: "cognitive-revolution-pod-q2-2026",
  },
  {
    status: "included",
    id: "nvidia-q2-2026",
    note: "YouTube channel; scored with talk prompt.",
  },
  {
    status: "included",
    id: "a16z-q2-2026",
  },
  {
    status: "included",
    id: "ml-street-talk-q2-2026",
    note: "H1 2026 (Q2 had <10 episodes).",
  },
  {
    status: "excluded",
    id: "lex-fridman-pod",
    label: "Lex Fridman Podcast",
    channelHandle: "lexfridman",
    reason:
      "Will not add — most episodes exceed the 3h scoring limit (see scoring-limits.ts).",
  },
];

export function listIncludedSourceIds(): string[] {
  return SOURCE_REGISTRY.filter((entry) => entry.status === "included").map(
    (entry) => entry.id,
  );
}

export function listExcludedSources(): ExcludedSourceEntry[] {
  return SOURCE_REGISTRY.filter(
    (entry): entry is ExcludedSourceEntry => entry.status === "excluded",
  );
}
