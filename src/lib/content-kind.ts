import type { SourceConfig } from "./sources-config.js";

export type ContentKind = SourceConfig["contentKind"];

export const CONTENT_KIND_LABELS: Record<
  ContentKind,
  {
    kind: string;
    topPicks: string;
    veryLong: string;
    other: string;
    otherLede: string;
  }
> = {
  conference: {
    kind: "Conference",
    topPicks: "Top talks",
    veryLong: "Very long talks",
    other: "Other talks",
    otherLede:
      "These talks are part of the same group and can be strong too—they just didn't make the top picks this time.",
  },
  podcast: {
    kind: "Podcast",
    topPicks: "Top episodes",
    veryLong: "Very long episodes",
    other: "Other episodes",
    otherLede:
      "These episodes are part of the same group and can be strong too—they just didn't make the top picks this time.",
  },
  channel: {
    kind: "Channel",
    topPicks: "Top videos",
    veryLong: "Very long videos",
    other: "Other videos",
    otherLede:
      "These videos are part of the same group and can be strong too—they just didn't make the top picks this time.",
  },
  essay: {
    kind: "Essays",
    topPicks: "Top essays",
    veryLong: "Very long essays",
    other: "Other essays",
    otherLede:
      "These essays are part of the same group and can be strong too—they just didn't make the top picks this time.",
  },
};
