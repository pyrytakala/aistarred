import "./landing.css";
import { CONTENT_KIND_LABELS } from "./lib/content-kind.js";
import { listSources, type SourceConfig } from "./lib/sources-config.js";

function sourceSubtitle(source: SourceConfig): string {
  const parts: string[] = [];
  if (source.period) {
    parts.push(source.period);
  }
  if (source.location) {
    parts.push(source.location);
  }
  return parts.join(" · ");
}

function renderCover(source: SourceConfig): HTMLElement {
  const cover = document.createElement("div");
  cover.className = "source-card-cover";

  const image = document.createElement("img");
  image.src = source.coverImage;
  image.alt = "";
  image.loading = "lazy";
  cover.appendChild(image);

  const kind = document.createElement("span");
  kind.className = "source-card-kind";
  kind.textContent = CONTENT_KIND_LABELS[source.contentKind].kind;
  cover.appendChild(kind);

  return cover;
}

function renderCard(source: SourceConfig): HTMLLIElement {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.className = "source-card";
  link.href = `/${source.slug}/`;

  link.appendChild(renderCover(source));

  const body = document.createElement("div");
  body.className = "source-card-body";

  const eyebrow = document.createElement("span");
  eyebrow.className = "source-card-eyebrow";
  eyebrow.textContent = CONTENT_KIND_LABELS[source.contentKind].topPicks;
  body.appendChild(eyebrow);

  const title = document.createElement("span");
  title.className = "source-card-title";
  title.textContent = source.title;
  body.appendChild(title);

  const subtitle = sourceSubtitle(source);
  if (subtitle) {
    const meta = document.createElement("span");
    meta.className = "source-card-meta";
    meta.textContent = subtitle;
    body.appendChild(meta);
  }

  link.appendChild(body);
  item.appendChild(link);
  return item;
}

function init(): void {
  const grid = document.getElementById("source-grid");
  if (!grid) {
    return;
  }

  grid.replaceChildren();
  for (const source of listSources()) {
    grid.appendChild(renderCard(source));
  }
}

init();
