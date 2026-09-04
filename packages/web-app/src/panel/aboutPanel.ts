/**
 * About-panel content: renders the system-overview markdown as a
 * lightly-styled document, followed by manifest-generated reference
 * sections (grammars + concept glossary) for the UI user.
 *
 * Split from the LLM's composed prompt: the LLM gets the FULL
 * manifest reference (macros, session controls, tools, resources,
 * session time, presets); the UI user gets the authored prose plus
 * grammars + concepts — the subset that's useful for making sense
 * of what's on screen without being a walking API reference.
 *
 * Source-of-truth for the prose is
 * @synesthetica/contracts/prompts/system-overview.md.
 * Vite's ?raw suffix inlines the markdown as a string at build time,
 * so runtime needs no HTTP fetch and the file lives in exactly one
 * place across the monorepo.
 */

import overviewMd from "@synesthetica/contracts/prompts/system-overview.md?raw";
import { productionManifest } from "@synesthetica/contracts";

export async function buildAboutPanel(): Promise<HTMLElement> {
  const wrap = document.createElement("div");
  wrap.className = "syn-about";
  wrap.appendChild(renderMarkdown(overviewMd));

  // Manifest-generated appendices for the user.
  wrap.appendChild(renderGrammarsSection());
  wrap.appendChild(renderConceptsSection());

  return wrap;
}

/** "Grammars" section — the three vertical columns, described. */
function renderGrammarsSection(): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "syn-about-appendix";
  wrap.appendChild(headingEl(2, "Grammars"));
  const intro = document.createElement("p");
  appendInline(
    intro,
    "The three vertical columns you see on screen, generated from the annotation manifest so this stays in sync with what the LLM knows.",
  );
  wrap.appendChild(intro);

  for (const g of productionManifest.grammars) {
    wrap.appendChild(headingEl(3, g.name ?? g.id));
    for (const note of g.notes ?? []) {
      const p = document.createElement("p");
      appendInline(p, note);
      wrap.appendChild(p);
    }
  }
  return wrap;
}

/**
 * "Concept glossary" section — every system concept, expandable-ish
 * (rendered as term + definition pairs). Sorted alphabetically for
 * findability.
 */
function renderConceptsSection(): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "syn-about-appendix";
  wrap.appendChild(headingEl(2, "Glossary"));
  const intro = document.createElement("p");
  appendInline(
    intro,
    "Terminology used across the interface — same definitions the LLM sees, so 'note-strip' or 'connector-arc' means the same thing whether you say it or Claude does.",
  );
  wrap.appendChild(intro);

  const dl = document.createElement("dl");
  dl.className = "syn-about-glossary";
  const concepts = [...productionManifest.concepts].sort((a, b) =>
    a.term.localeCompare(b.term),
  );
  for (const c of concepts) {
    const dt = document.createElement("dt");
    dt.textContent = c.term;
    dl.appendChild(dt);
    const dd = document.createElement("dd");
    appendInline(dd, c.definition);
    if (c.examples?.length) {
      const ul = document.createElement("ul");
      for (const ex of c.examples) {
        const li = document.createElement("li");
        appendInline(li, ex);
        ul.appendChild(li);
      }
      dd.appendChild(ul);
    }
    dl.appendChild(dd);
  }
  wrap.appendChild(dl);
  return wrap;
}

/**
 * Minimal Markdown-to-DOM renderer covering the subset used by
 * system-overview.md. Preserves headings, paragraphs, bullet lists,
 * pipe-tables, horizontal rules, and inline code / bold / italic.
 * Not a general Markdown implementation.
 */
function renderMarkdown(md: string): HTMLElement {
  const root = document.createElement("div");
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) {
      root.appendChild(headingEl(1, line.slice(2)));
      i++;
    } else if (line.startsWith("## ")) {
      root.appendChild(headingEl(2, line.slice(3)));
      i++;
    } else if (line.startsWith("### ")) {
      root.appendChild(headingEl(3, line.slice(4)));
      i++;
    } else if (line.trim() === "---") {
      root.appendChild(document.createElement("hr"));
      i++;
    } else if (line.startsWith("```")) {
      // Fenced code block — skip through to closing fence.
      const pre = document.createElement("pre");
      i++;
      const buf: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      pre.textContent = buf.join("\n");
      root.appendChild(pre);
      i++;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const ul = document.createElement("ul");
      while (
        i < lines.length &&
        (lines[i].startsWith("- ") || lines[i].startsWith("* "))
      ) {
        const li = document.createElement("li");
        appendInline(li, lines[i].slice(2));
        ul.appendChild(li);
        i++;
      }
      root.appendChild(ul);
    } else if (line.startsWith("| ")) {
      // Pipe table — read consecutive pipe lines.
      const table = document.createElement("table");
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(splitPipeRow(lines[i]));
        i++;
      }
      if (rows.length >= 2) {
        const thead = document.createElement("thead");
        const trH = document.createElement("tr");
        for (const cell of rows[0]) {
          const th = document.createElement("th");
          appendInline(th, cell.trim());
          trH.appendChild(th);
        }
        thead.appendChild(trH);
        table.appendChild(thead);
        const tbody = document.createElement("tbody");
        // rows[1] is the separator (---|---); skip.
        for (let r = 2; r < rows.length; r++) {
          const tr = document.createElement("tr");
          for (const cell of rows[r]) {
            const td = document.createElement("td");
            appendInline(td, cell.trim());
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
      }
      root.appendChild(table);
    } else if (line.trim().length === 0) {
      i++;
    } else {
      // Paragraph — accumulate consecutive non-empty non-special lines.
      const buf: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().length > 0 &&
        !isBlockStart(lines[i])
      ) {
        buf.push(lines[i]);
        i++;
      }
      const p = document.createElement("p");
      appendInline(p, buf.join(" "));
      root.appendChild(p);
    }
  }
  return root;
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("# ") ||
    line.startsWith("## ") ||
    line.startsWith("### ") ||
    line.trim() === "---" ||
    line.startsWith("```") ||
    line.startsWith("- ") ||
    line.startsWith("* ") ||
    line.startsWith("|")
  );
}

function headingEl(level: 1 | 2 | 3, text: string): HTMLElement {
  const h = document.createElement(`h${level}`);
  appendInline(h, text);
  return h;
}

function splitPipeRow(line: string): string[] {
  // Strip the leading/trailing pipes then split.
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|");
}

/**
 * Handle inline markup: `code`, **bold**, *italic*. Left as-is
 * otherwise. Uses regex-based tokenisation — not robust for nested
 * markup, sufficient for the overview's simple usage.
 */
function appendInline(parent: HTMLElement, text: string): void {
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    const tok = m[0];
    if (tok.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = tok.slice(1, -1);
      parent.appendChild(code);
    } else if (tok.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = tok.slice(2, -2);
      parent.appendChild(strong);
    } else {
      const em = document.createElement("em");
      em.textContent = tok.slice(1, -1);
      parent.appendChild(em);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    parent.appendChild(document.createTextNode(text.slice(last)));
  }
}
