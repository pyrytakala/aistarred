import type { AudienceLevel } from "./audience-level.js";

export type { AudienceLevel };

export interface Tag {
  label: string;
  tone: "positive" | "negative";
}

export interface VideoIndexEntry {
  id: string;
  title: string;
  url?: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  upload_date?: string | null;
  duration_seconds?: number | null;
  channel?: string | null;
  description?: string | null;
  transcript_status?: string;
  transcript_provider?: string;
  transcript_path?: string;
  line_count?: number;
  language_code?: string | null;
  available_langs?: string[];
  error?: string;
}

export interface IndexPayload {
  provider?: string;
  channel_url?: string;
  months?: number;
  video_count?: number;
  videos: VideoIndexEntry[];
}

export interface RankedVideo {
  id: string;
  title: string;
  display_title?: string;
  url?: string;
  speakers?: string;
  status?: string;
  rank?: number;
  composite?: number;
  composite_base?: number;
  like_adjustment?: number;
  length_adjustment?: number;
  like_count?: number | null;
  upload_date?: string | null;
  duration_seconds?: number | null;
  summary_bullets?: string[];
  substance?: number;
  evidence?: number;
  specificity?: number;
  insight_density?: number;
  non_promotion?: number;
  confidence?: string;
  audience_level?: AudienceLevel;
  central_claims?: string;
  tags?: Tag[];
  score_path?: string;
  cache_hit?: boolean;
  error?: string;
  like_rank?: number;
}

export interface RankingsPayload {
  source_id?: string;
  model?: string;
  prompt_path?: string;
  video_count?: number;
  scored_count?: number;
  ranked_count?: number;
  rankings: RankedVideo[];
  too_long?: RankedVideo[];
  other?: RankedVideo[];
  failures?: RankedVideo[];
}

export type VideoRecord = Record<string, unknown>;
