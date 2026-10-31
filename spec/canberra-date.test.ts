import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

// canberraDate() lives in src/db.ts, which opens its sqlite file as an
// import-time side effect — importing it here directly (rather than going
// through the running app, like every other spec/*.test.ts) would otherwise
// reuse whatever DATA_DIR that already-running app was started with, risking
// two processes fighting over the same file. So DATA_DIR is pointed at a
// disposable temp directory just for this one import, then restored.
let canberraDate: (date: Date) => string;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cairn-canberra-date-test-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  ({ canberraDate } = await import("../src/db.ts"));
  process.env.DATA_DIR = previous;
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

// ADR 0004's one-stone-a-day limit is keyed on Australia/Canberra's calendar
// day, not UTC's — so a moment that's still "yesterday" in UTC but already
// "today" in Canberra (any time after UTC+10/11's midnight but before UTC's
// own) has to be counted as the Canberra day, or the limit would reset a day
// late for anyone testing it against UTC intuition.
it("counts 1:30am Canberra time as the Canberra day, even though it's still the previous day in UTC", () => {
  // 2026-10-31T14:30:00Z is 2026-11-01 01:30 AEDT (Canberra is UTC+11 under
  // daylight saving, which is in effect by late October).
  const moment = new Date("2026-10-31T14:30:00.000Z");
  expect(moment.toISOString().slice(0, 10), "sanity check: still Oct 31 in UTC").toBe("2026-10-31");
  expect(canberraDate(moment), "already Nov 1 in Canberra").toBe("2026-11-01");
});
