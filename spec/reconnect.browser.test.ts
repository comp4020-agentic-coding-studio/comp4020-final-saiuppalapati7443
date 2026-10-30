import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";

// client.js is the only place that renders stones into the DOM, so the
// reconnect-duplicates bug (every "state" message calling landStone() for
// every stone, with nothing cleared and nothing keyed by id) can only be
// caught by an actual browser rendering actual markup — spec/cairn.test.ts's
// WebSocket-level checks never look at the DOM at all.
const baseUrl = inject("baseUrl");

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

it("shows exactly one .stone element per stone after a reconnect, never a duplicate", async () => {
  page = await browser.newPage();
  await page.goto(new URL("/", baseUrl).toString());
  await page.waitForSelector("#carry-stone");

  // Drop one stone from this same session so there's something to duplicate.
  // Other spec/*.browser.test.ts files run concurrently against the same
  // shared app and drop their own stones, which broadcast to this page too —
  // so this counts elements for *this test's own* stone id specifically
  // (client.js tags each with data-stone-id), not the page's total .stone
  // count, which the dedup bug wouldn't be the only thing moving.
  const carryBox = await page.locator("#carry-stone").boundingBox();
  const cairnBox = await page.locator("#cairn").boundingBox();
  if (!carryBox || !cairnBox) throw new Error("expected both elements to be visible");
  const stoneCountBeforeDrop = await page.locator(".stone").count();
  await page.mouse.move(carryBox.x + carryBox.width / 2, carryBox.y + carryBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cairnBox.x + cairnBox.width / 2, cairnBox.y + cairnBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(
    (before) => document.querySelectorAll(".stone").length > before,
    stoneCountBeforeDrop,
  );

  const stoneId = await page.evaluate(() => {
    const els = document.querySelectorAll(".stone[data-stone-id]");
    return els[els.length - 1].getAttribute("data-stone-id");
  });

  // Force the client's WebSocket to close and reconnect, the same recovery
  // path a real network blip or server restart triggers (client.js's own
  // "close" listener calls connect() again after 1s) — without navigating
  // away, since a reload would trivially "fix" a bug that only shows up when
  // the existing DOM is kept and a fresh "state" push arrives on top of it.
  await page.evaluate(() => {
    // @ts-expect-error -- test-only hook into client.js's module-scope socket
    window.__cairnSocketForTest?.close();
  });

  // Wait past client.js's 1s reconnect delay, then past the server's initial
  // "state" push on the new connection.
  await page.waitForTimeout(2000);

  const matchingAfter = await page.locator(`.stone[data-stone-id="${stoneId}"]`).count();
  expect(matchingAfter, "a reconnect must not duplicate this test's already-landed stone").toBe(1);

  await page.close();
});
