import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The two things the course relies on, checked against the RUNNING app
// (spec/global-setup.ts finds it): it answers at /, and /readme/ publishes
// README.md. Every other check in spec/ is yours.
const baseUrl = inject("baseUrl");

it("answers at /", async () => {
  const res = await fetch(new URL("/", baseUrl));
  expect(res.status).toBe(200);
});

// Every renderer turns markdown into slightly different text, so rather than
// render it here this checks the README's headings: each one has to appear on
// the served page, in order. A missing page, or one left behind when README.md
// changes, fails.
const text = (html: string): string => new JSDOM(html).window.document.body.textContent ?? "";

// Link targets and inline HTML never show up as text once rendered, so they're
// dropped from both sides (the placeholder's verbatim copy still carries them).
// Then letters and digits only: renderers disagree about punctuation (smart
// quotes, dashes, entities) and whitespace, and none of that is content.
const normalise = (s: string): string =>
  s
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

// ATX headings (`## Like this`) outside fenced code.
function headings(md: string): string[] {
  const found: string[] = [];
  let fenced = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^ {0,3}#{1,6}\s+(.*?)(\s+#+)?\s*$/);
    if (heading) found.push(heading[1]);
  }
  return found;
}

it("publishes README.md at /readme/", async () => {
  const expected = headings(readFileSync("README.md", "utf8"));
  expect(expected, "README.md has no headings to check /readme/ against").not.toEqual([]);

  const res = await fetch(new URL("/readme/", baseUrl));
  expect(res.status).toBe(200);
  const served = normalise(text(await res.text()));

  let from = 0;
  for (const heading of expected) {
    const at = served.indexOf(normalise(heading), from);
    expect(
      at,
      `/readme/ is missing the README heading "${heading}" (or has it out of order)`,
    ).not.toBe(-1);
    from = at + normalise(heading).length;
  }
});

// A newcomer plausibly lands on /readme/ first (a shared link, a marker
// reading the brief before the app), and the page itself has to get them
// back to the actual cairn — README.md's own content has no reason to link
// to the site it's hosted on, so this is about readmePage()'s wrapper HTML
// in src/server.ts, not README.md's content.
it("links back to the app from /readme/", async () => {
  const res = await fetch(new URL("/readme/", baseUrl));
  const html = await res.text();
  const dom = new JSDOM(html);
  const links = [...dom.window.document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  expect(
    links.some((href) => href === "/" || href === "/index.html"),
    `/readme/ has no link back to the app; links found: ${JSON.stringify(links)}`,
  ).toBe(true);
});

// README.md's "Which claims are enforced and which are judged" section is a
// markdown table. If the renderer has no table support, this content still
// shows up as text (so "publishes README.md" above stays green) but as one
// garbled paragraph of literal `|` characters instead of an actual <table> —
// a marker reading /readme/ sees pipes, not rows. This counts real <tr>s
// against the real row count in README.md's own table, so a renderer with no
// table support (0 <tr> elements) fails here even though the heading-only
// check above can't see the difference.
it("renders README's claims table as a real table on /readme/", async () => {
  const markdown = readFileSync("README.md", "utf8");
  const tableLines = markdown
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"));
  expect(tableLines.length, "README.md has no markdown table to check /readme/ against").toBeGreaterThan(2);
  // header + separator + body rows in the markdown source; the separator row
  // (`| --- | --- |`) renders nothing, so the real table has one fewer <tr>.
  const expectedRows = tableLines.length - 1;

  const res = await fetch(new URL("/readme/", baseUrl));
  const html = await res.text();
  const dom = new JSDOM(html);
  const table = dom.window.document.querySelector("table");
  expect(table, "/readme/ has no <table> element at all").not.toBeNull();
  const rows = table?.querySelectorAll("tr") ?? [];
  expect(rows.length, `/readme/'s table has ${rows.length} row(s), expected ${expectedRows}`).toBe(
    expectedRows,
  );
});
