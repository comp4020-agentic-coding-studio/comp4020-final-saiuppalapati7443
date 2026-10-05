// A hand-written renderer for exactly the markdown this app's README uses:
// headings, paragraphs, bold/italic, links, images, and `-`/`*` lists. Not a
// general CommonMark implementation — see docs/adr/0001-stack.md for why
// that's the deliberate trade-off instead of a markdown dependency.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A relative link/image target resolves against the current URL, but the
// README is served at /readme/ while its images live at /docs/... — so any
// target that isn't absolute (http(s):, #, or a leading /) is rewritten to
// resolve from the site root instead.
function rootRelative(target: string): string {
  if (/^(https?:)?\/\//.test(target) || target.startsWith("/") || target.startsWith("#")) {
    return target;
  }
  return `/${target}`;
}

// Code spans are pulled out behind placeholders before any other inline
// pattern runs, and restored last — otherwise markdown syntax *inside* a
// `backtick span` (e.g. a literal `![alt](src)` shown as code) gets rendered
// a second time instead of staying literal text.
function renderInline(text: string): string {
  let out = escapeHtml(text);
  const codeSpans: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = out.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, src: string) => `<img alt="${alt}" src="${rootRelative(src)}">`,
  );
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, href: string) => `<a href="${rootRelative(href)}">${label}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeSpans[Number(index)]);
  return out;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let inList = false;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = (): void => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    const listItem = line.match(/^[-*]\s+(.*)$/);

    if (line.trim() === "") {
      flushParagraph();
      closeList();
      continue;
    }
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (listItem) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(listItem[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();

  return html.join("\n");
}
