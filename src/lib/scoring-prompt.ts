import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SourceConfig } from "./sources-config.js";

export const SCORING_PROMPT_FILE = "scoring_prompt.txt";

type ContentKind = SourceConfig["contentKind"];

const PROMPT_VARS: Record<ContentKind, Record<string, string>> = {
  conference: {
    content_descriptor: "conference talk transcript",
    consumer: "viewer",
    author_label: "Speaker(s)",
    text_label: "Transcript (timestamped)",
    summary_intro: "someone who has not seen the talk",
    forbidden_summary_leads: '"Shows/Presents/Proposes/Covers"',
    claim_empty_cases: "topic tour, product pitch, restatement of common knowledge",
    polish_type: "delivery polish",
    cluster_label: "talks",
    insight_density_detail: "how much substance per minute vs. filler/setup/repetition",
    confidence_caveat: "the talk is visual/demo-heavy (transcript understates it) or the transcript is poor",
    audience_unfamiliar: "Unfamiliar viewers will often feel lost",
    audience_example: "e.g. working ML engineer, product engineer shipping agents",
    substantive_line: "Most substantive line (quote + timestamp):",
  },
  channel: {
    content_descriptor: "channel video transcript",
    consumer: "viewer",
    author_label: "Speaker(s)",
    text_label: "Transcript (timestamped)",
    summary_intro: "someone who has not seen the video",
    forbidden_summary_leads: '"Shows/Presents/Proposes/Covers"',
    claim_empty_cases: "topic tour, product pitch, restatement of common knowledge",
    polish_type: "delivery polish",
    cluster_label: "videos",
    insight_density_detail: "how much substance per minute vs. filler/setup/repetition",
    confidence_caveat: "the video is visual/demo-heavy (transcript understates it) or the transcript is poor",
    audience_unfamiliar: "Unfamiliar viewers will often feel lost",
    audience_example: "e.g. working ML engineer, product engineer shipping agents",
    substantive_line: "Most substantive line (quote + timestamp):",
  },
  podcast: {
    content_descriptor: "podcast episode transcript",
    consumer: "listener",
    author_label: "Guest(s) / host(s)",
    text_label: "Transcript (timestamped)",
    summary_intro: "someone who has not heard the episode",
    forbidden_summary_leads: '"Discusses/Covers/Explores"',
    claim_empty_cases:
      "topic tour, product pitch, restatement of common knowledge, mostly banter",
    polish_type: "delivery polish",
    cluster_label: "episodes",
    insight_density_detail:
      "how much substance per minute vs. filler/setup/repetition/sponsor reads",
    confidence_caveat:
      "the episode is visual/demo-heavy (transcript understates it) or the transcript is poor",
    audience_unfamiliar: "Unfamiliar listeners will often feel lost",
    audience_example: "e.g. working ML engineer shipping agents",
    substantive_line: "Most substantive line (quote + timestamp):",
  },
  essay: {
    content_descriptor: "an essay",
    consumer: "reader",
    author_label: "Author(s)",
    text_label: "Essay text",
    summary_intro: "someone who has not read the essay",
    forbidden_summary_leads: '"Discusses/Covers/Explores"',
    claim_empty_cases: "topic tour, restatement of common knowledge, mostly anecdote",
    polish_type: "prose polish",
    cluster_label: "essays",
    insight_density_detail: "how much substance vs. filler/setup/repetition",
    confidence_caveat: "key arguments depend on visuals or the extract is incomplete",
    audience_unfamiliar: "Unfamiliar readers will often feel lost",
    audience_example: "e.g. working practitioner in the field",
    substantive_line: "Most substantive line (quote verbatim if possible):",
  },
};

export function scoringPromptVars(contentKind: ContentKind): Record<string, string> {
  return PROMPT_VARS[contentKind];
}

export function renderScoringPromptTemplate(
  template: string,
  contentKind: ContentKind,
): string {
  let result = template;
  for (const [key, value] of Object.entries(scoringPromptVars(contentKind))) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export function loadScoringPromptTemplate(contentKind: ContentKind): string {
  const path = resolve(process.cwd(), SCORING_PROMPT_FILE);
  const raw = readFileSync(path, "utf8");
  return renderScoringPromptTemplate(raw, contentKind);
}

export function scoringPromptPath(): string {
  return resolve(process.cwd(), SCORING_PROMPT_FILE);
}
