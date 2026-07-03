const UPLOAD_DATE_RE = /"uploadDate":"([^"]+)"/;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

export function uploadDateFromIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function fetchYoutubeUploadDate(
  videoId: string,
  requestDelay = 0,
): Promise<string | null> {
  if (requestDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, requestDelay));
  }

  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`YouTube HTTP ${response.status}`);
  }

  const html = await response.text();
  const match = UPLOAD_DATE_RE.exec(html);
  if (!match) {
    return null;
  }
  return uploadDateFromIso(match[1]);
}

export function monthsAgo(months: number, now = new Date()): Date {
  const wholeMonths = Math.trunc(months);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  let targetYear = year + Math.floor((month - wholeMonths) / 12);
  let targetMonth = ((month - wholeMonths) % 12 + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  let targetDay = Math.min(day, lastDay);

  const extraDays = Math.round((months - wholeMonths) * 30);
  if (extraDays > 0) {
    targetDay = Math.max(1, targetDay - extraDays);
  }

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

export function parseIsoDatetime(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value.replace("Z", "+00:00"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function plainTextFromString(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function titleToFilename(title: string): string {
  const name = (title || "untitled").replace(/[/\\]/g, "-").trim() || "untitled";
  return `${name}.txt`;
}

export function safeFilename(title: string, videoId: string): string {
  const name = (title || videoId).replace(/[/\\]/g, "-").trim() || videoId;
  return `${name} [${videoId}]`;
}

export function sleep(seconds: number): Promise<void> {
  if (seconds <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
