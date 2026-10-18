// One line per event, to stdout, readable by a human tailing `flyctl logs`.
// CLAUDE.md: every action that changes shared state must log who did it, and
// a cookie id must never appear in a log line — callers pass a pseudonym
// string (src/pseudonym.ts), never a visitorId.

const LABEL_WIDTH = 8;

export function logEvent(type: string, actor: string | null, detail: string): void {
  console.log(`${type.padEnd(LABEL_WIDTH)}${actor ?? "-"} ${detail}`.trimEnd());
}
