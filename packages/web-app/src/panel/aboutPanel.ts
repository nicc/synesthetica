/**
 * About-panel content: a short user-facing intro followed by a
 * collapsed disclosure of the full LLM primer for the curious.
 *
 * Design intent: the About panel is deliberately minimal. The intro
 * prose (ABOUT.md in this package) explains what Synesthetica is and
 * points to the GitHub repo for depth. The full LLM primer — the
 * same text the get_started MCP tool returns — is available behind a
 * <details> toggle so anyone who wants to see exactly what the LLM
 * has been told can read it, but it doesn't dominate the panel.
 *
 * Sources of truth:
 * - Intro: packages/web-app/ABOUT.md (this package).
 * - Primer: packages/contracts/prompts/system-overview.md (shared
 *   with the MCP server so the panel and the LLM always see the
 *   same words).
 *
 * Vite's ?raw suffix inlines both markdown files as strings at build
 * time, so runtime needs no HTTP fetch.
 *
 * Rendering uses `marked` — commonmark + GFM, tables, fenced code,
 * nested lists, all handled properly without the edge-case bugs of a
 * hand-rolled parser. `breaks: true` turns hard-wrapped lines into
 * <br> (matching what the composer emits for its per-field lines).
 * Content is trusted end-to-end (both markdown sources are authored
 * by us and baked into the build; nothing user-supplied flows here),
 * so innerHTML is safe.
 */

import { marked } from "marked";
import aboutMd from "../../ABOUT.md?raw";
import overviewMd from "@synesthetica/contracts/prompts/system-overview.md?raw";
import { composeSystemOverview } from "@synesthetica/contracts";

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Small screens get a warning strip on the About page and see About on
 * every load. The renderer contains the 4:3 world in the viewport
 * (nothing is cropped), so the limit is legibility: the world renders
 * smaller than 768×576px below these sizes (note names ~6px). Catches
 * all phones in either orientation. Keep in sync with the @media rule
 * for .syn-about-mobile-warning in index.html.
 */
export const NARROW_SCREEN_QUERY = "(max-width: 767px), (max-height: 575px)";

export const SMALL_SCREEN_WARNING =
  "This app is not built for small screens. Best on desktop.";

export function isNarrowScreen(): boolean {
  try {
    return window.matchMedia(NARROW_SCREEN_QUERY).matches;
  } catch {
    return false;
  }
}

export async function buildAboutPanel(): Promise<HTMLElement> {
  const wrap = document.createElement("div");
  wrap.className = "syn-about";

  // Not-built-for-mobile warning; hidden by CSS except on narrow screens.
  const warning = document.createElement("p");
  warning.className = "syn-about-mobile-warning";
  warning.textContent = SMALL_SCREEN_WARNING;
  wrap.appendChild(warning);

  // User-facing intro (short, prose, points at repo for depth).
  wrap.appendChild(renderMarkdown(aboutMd));

  // Collapsed disclosure of the full LLM primer for anyone who
  // wants to see exactly what the MCP server tells the LLM. Uses
  // the same composeSystemOverview() the CLI feeds to get_started,
  // fed the same authored .md; both surfaces render byte-identical
  // primer text.
  const details = document.createElement("details");
  details.className = "syn-about-primer";
  const summary = document.createElement("summary");
  summary.textContent = "Show LLM primer";
  details.appendChild(summary);
  const primerBody = document.createElement("div");
  primerBody.className = "syn-about-primer-body";
  primerBody.appendChild(renderMarkdown(composeSystemOverview(overviewMd)));
  details.appendChild(primerBody);
  wrap.appendChild(details);

  return wrap;
}

/**
 * Render markdown to a DOM element. Uses `marked` — see file header
 * for the safety rationale.
 */
function renderMarkdown(md: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = marked.parse(md) as string;
  // Make links open in a new tab. `marked` doesn't do this by
  // default, and rewriting anchors post-parse is cleaner than a
  // custom renderer for a one-off requirement.
  for (const a of root.querySelectorAll("a")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  return root;
}
