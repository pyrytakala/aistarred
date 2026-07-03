import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveYtDlpCommandFrom } from "./youtube-channel.js";
import { plainTextFromString } from "./utils.js";

export function fetchTranscriptWithYtDlp(videoId: string): string | null {
  const ytDlp = resolveYtDlpCommandFrom();
  if (!ytDlp) {
    return null;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "endslop-transcript-"));
  const outputTemplate = join(tempDir, "%(id)s");

  try {
    const result = spawnSync(
      ytDlp[0],
      [
        ...ytDlp.slice(1),
        "--ignore-errors",
        "--no-warnings",
        "--sleep-subtitles",
        "3",
        "--skip-download",
        "--write-auto-sub",
        "--write-sub",
        "--sub-lang",
        "en.*,en",
        "--sub-format",
        "vtt/best",
        "-o",
        outputTemplate,
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { encoding: "utf8" },
    );

    if (result.status !== 0) {
      return null;
    }

    const subtitlePath = findSubtitleFile(tempDir, videoId);
    if (!subtitlePath) {
      return null;
    }

    return plainTextFromVtt(readFileSync(subtitlePath, "utf8"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function findSubtitleFile(tempDir: string, videoId: string): string | null {
  const candidates = readdirSync(tempDir).filter(
    (name) => name.includes(videoId) && name.endsWith(".vtt"),
  );
  return candidates.length ? join(tempDir, candidates[0]) : null;
}

function plainTextFromVtt(vtt: string): string {
  const lines = vtt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        line !== "WEBVTT" &&
        !line.startsWith("NOTE") &&
        !/^\d+$/.test(line) &&
        !/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->/.test(line) &&
        !line.startsWith("align:") &&
        !line.startsWith("position:"),
    );

  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.at(-1) !== line) {
      deduped.push(line);
    }
  }

  return plainTextFromString(deduped.join("\n"));
}
