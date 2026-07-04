import "./landing.css";
import { CONTENT_KIND_LABELS } from "./lib/content-kind.js";
import { loadSourcesManifest } from "./lib/sources-manifest.js";
import { sourceSubtitle } from "./lib/public-source.js";
import type { PublicSource } from "./lib/public-source.js";

function renderCover(source: PublicSource): HTMLElement {
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

function renderCard(source: PublicSource): HTMLLIElement {
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

async function init(): Promise<void> {
  const grid = document.getElementById("source-grid");
  if (!grid) {
    return;
  }

  const manifest = await loadSourcesManifest();
  grid.replaceChildren();
  for (const source of manifest.sources) {
    grid.appendChild(renderCard(source));
  }
}

init().catch((error: Error) => {
  const grid = document.getElementById("source-grid");
  if (grid) {
    grid.replaceChildren();
    const message = document.createElement("li");
    message.className = "landing-error";
    message.textContent = error.message;
    grid.appendChild(message);
  }
});
