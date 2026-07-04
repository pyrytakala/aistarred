import type { RankedVideo } from "./types.js";

const SUMMARY_BULLETS_SECTION_RE =
  /^(?:-\s*)?(?:\*\*)?Summary bullets:(?:\*\*)?\s*\n([\s\S]*?)(?=\n(?:-\s*)?(?:\*\*)?Central claim)/im;
const SUMMARY_BULLET_LINE_RE = /^\s*-\s+(.+)$/gm;
const COMPOSITE_LINE_RE = /^(?:-\s*)?(?:\*\*)?COMPOSITE/im;
const COMPOSITE_SCORE_RE = /([\d.]+)\s*\/\s*100/g;
const CONFIDENCE_RE = /Confidence:\s*(?:\*\*)?(High|Med|Low)/i;

const DIMENSION_RES: Record<string, RegExp> = {
  substance: /^(?:-\s*)?(?:\*\*)?Substance:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$/im,
  evidence: /^(?:-\s*)?(?:\*\*)?Evidence:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$/im,
  specificity: /^(?:-\s*)?(?:\*\*)?Specificity:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$/im,
  insight_density:
    /^(?:-\s*)?(?:\*\*)?Insight density:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$/im,
  non_promotion:
    /^(?:-\s*)?(?:\*\*)?Non-promotion:(?:\*\*)?\s*.+?(?:\*\*)?(\d+(?:\.\d+)?)(?:\*\*)?\s*$/im,
};

export function extractSpeakers(title: string, description?: string | null): string {
  if (title.includes(" - ")) {
    return title.split(" - ").at(-1)?.trim() || "Unknown";
  }
  if (description) {
    const names = [...description.matchAll(/-\s*(.+?)(?:\n|$)/g)].map((match) => match[1].trim());
    if (names.length) {
      return names.slice(0, 3).join("; ");
    }
  }
  return "Unknown";
}

export function extractSummaryBullets(text: string): string[] {
  const section = SUMMARY_BULLETS_SECTION_RE.exec(text);
  if (!section) {
    return [];
  }

  const bullets: string[] = [];
  for (const match of section[1].matchAll(SUMMARY_BULLET_LINE_RE)) {
    const bullet = match[1].trim();
    if (bullet) {
      bullets.push(bullet);
    }
    if (bullets.length >= 5) {
      break;
    }
  }
  return bullets;
}

export function extractComposite(text: string): number | null {
  const compositeLine = COMPOSITE_LINE_RE.exec(text);
  if (compositeLine) {
    const block = text.slice(compositeLine.index, compositeLine.index + 500);
    const scores = [...block.matchAll(COMPOSITE_SCORE_RE)].map((match) => Number(match[1]));
    if (scores.length) {
      return scores.at(-1) ?? null;
    }
  }

  const totalMatch = /Total\s*=\s*([\d.]+)\s*\/\s*100/i.exec(text);
  if (totalMatch) {
    return Number(totalMatch[1]);
  }
  return null;
}

export function parseScoreResponse(text: string): Partial<RankedVideo> & { raw_response?: string } {
  const result: Partial<RankedVideo> & { raw_response?: string } = { raw_response: text };

  const summaryBullets = extractSummaryBullets(text);
  if (summaryBullets.length) {
    result.summary_bullets = summaryBullets;
  }

  const composite = extractComposite(text);
  if (composite != null) {
    result.composite = composite;
  }

  const confidenceMatch = CONFIDENCE_RE.exec(text);
  if (confidenceMatch) {
    const value = confidenceMatch[1].toLowerCase();
    result.confidence = value.charAt(0).toUpperCase() + value.slice(1);
  }

  for (const [name, pattern] of Object.entries(DIMENSION_RES)) {
    const match = pattern.exec(text);
    if (match) {
      (result as Record<string, number>)[name] = Number(match[1]);
    }
  }

  const claimMatch =
    /Central claim\(s\):\s*(.+?)(?=\n-\s*Substance:|\nSubstance:|\Z)/is.exec(text);
  if (claimMatch) {
    result.central_claims = claimMatch[1].trim();
  }

  return result;
}
