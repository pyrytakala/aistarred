#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CONTENT_KIND_LABELS } from "../src/lib/content-kind.js";
import { listSources, type SourceConfig } from "../src/lib/sources.js";

const ROOT = resolve(import.meta.dirname, "..");
const TEMPLATE_PATH = join(ROOT, "templates", "source-listing.html");

function bodyAttributes(source: SourceConfig): string {
  const attrs = [
    ` data-source-id="${source.id}"`,
    ` data-content-kind="${source.contentKind}"`,
    ` data-item-label="${source.itemLabel}"`,
  ];

  if (source.dateRange) {
    attrs.push(` data-date-since="${source.dateRange.since}"`);
    attrs.push(` data-date-until="${source.dateRange.until}"`);
  }

  if (source.maxDisplayAgeDays != null) {
    attrs.push(` data-max-display-age-days="${source.maxDisplayAgeDays}"`);
  }

  return attrs.join("");
}

function renderListingPage(source: SourceConfig, template: string): string {
  const labels = CONTENT_KIND_LABELS[source.contentKind];

  return template
    .replaceAll("{{DOCUMENT_TITLE}}", `${source.pageTitle} — AI starred`)
    .replaceAll("{{BODY_ATTRIBUTES}}", bodyAttributes(source))
    .replaceAll("{{PAGE_HEADING}}", source.pageTitle)
    .replaceAll("{{TOP_PICKS_HEADING}}", labels.topPicks);
}

function syncListingPages(): void {
  const template = readFileSync(TEMPLATE_PATH, "utf8");

  for (const source of listSources()) {
    const html = renderListingPage(source, template);
    const dir = join(ROOT, source.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html, "utf8");
    console.log(`Wrote ${source.slug}/index.html`);
  }
}

syncListingPages();
