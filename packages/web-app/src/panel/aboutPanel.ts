/**
 * About-panel content: fetches the system-overview markdown from
 * public/ and renders it as a lightly-styled document. Intentionally
 * simple — no full Markdown parser dependency, just the subset the
 * overview uses (headings, paragraphs, tables, lists, hr, code spans).
 */

const OVERVIEW_URL = "/system-overview.md";

export async function buildAboutPanel(): Promise<HTMLElement> {
  const wrap = document.createElement("div");
  wrap.className = "syn-about";
  try {
    const res = await fetch(OVERVIEW_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    wrap.appendChild(renderMarkdown(md));
  } catch (err) {
    const p = document.createElement("p");
    p.className = "syn-about-error";
    p.textContent = `Could not load system overview: ${
      err instanceof Error ? err.message : String(err)
    }`;
    wrap.appendChild(p);
  }
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
