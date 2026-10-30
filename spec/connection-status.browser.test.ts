import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";

// drop() in client.js silently no-ops when the socket isn't OPEN, with
// nothing on the page telling a visitor their drag didn't actually land —
// only a real browser, with a real disconnect and a real carry-stone
// element, can show that gap. spec/cairn.test.ts never renders anything.
const baseUrl = inject("baseUrl");

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

it("shows a plain disconnected status and disables the carry stone while the connection is down, then recovers", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL("/", baseUrl).toString());
  await page.waitForSelector("#carry-stone");

  // Connected and idle: carry stone must be interactive.
  await expect.poll(() => page.locator("#carry-stone").getAttribute("aria-disabled")).not.toBe("true");

  await context.setOffline(true);
  // Force the existing socket closed — the same thing a real dropped
  // connection (wifi loss, laptop sleep) looks like from client.js's
  // perspective, which only ever learns about it via the socket's own
  // "close" event.
  await page.evaluate(() => {
    // @ts-expect-error -- test-only hook into client.js's module-scope socket
    window.__cairnSocketForTest?.close();
  });

  await expect
    .poll(() => page.locator("#carry-hint").textContent(), { timeout: 5000 })
    .toMatch(/reconnecting/i);
  await expect
    .poll(() => page.locator("#carry-stone").getAttribute("aria-disabled"), { timeout: 5000 })
    .toBe("true");

  await context.setOffline(false);

  await expect
    .poll(() => page.locator("#carry-stone").getAttribute("aria-disabled"), { timeout: 10000 })
    .not.toBe("true");
  await expect
    .poll(() => page.locator("#carry-hint").textContent(), { timeout: 5000 })
    .not.toMatch(/reconnecting/i);

  await page.close();
  await context.close();
});

it("sends an explicit refusal message when the server rejects a drop, instead of silently dropping it", async () => {
  // A listener attached to "websocket" after the page has already navigated
  // can miss the event entirely — client.js opens its socket the instant the
  // page loads, so this has to be registered on a page that hasn't navigated
  // yet (the same "attach before it can fire" rule as spec/cairn.test.ts's
  // message queue, one level up: the event here, not a message on it).
  const page = await browser.newPage();

  // Watch the actual WebSocket frames, not just the hint text, so this can't
  // pass coincidentally off the unrelated "mine" flag a successful drop's
  // own broadcast already sets — it has to see a distinct message the
  // *refusal* itself causes.
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (frame) => {
      if (typeof frame.payload === "string") frames.push(frame.payload);
    });
  });

  await page.goto(new URL("/", baseUrl).toString());
  await page.waitForSelector("#carry-stone");

  // Drop once via the real drag path, exactly like a visitor would.
  const carryBox = await page.locator("#carry-stone").boundingBox();
  const cairnBox = await page.locator("#cairn").boundingBox();
  if (!carryBox || !cairnBox) throw new Error("expected both elements to be visible");
  await page.mouse.move(carryBox.x + carryBox.width / 2, carryBox.y + carryBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cairnBox.x + cairnBox.width / 2, cairnBox.y + cairnBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.locator(".stone").count()).toBeGreaterThanOrEqual(1);

  frames.length = 0; // only care about what the second, refused drop causes

  // Bypass the now-disabled UI and send a second "drop" directly on the
  // same socket/cookie — the server must refuse it and tell this client
  // why, rather than silently dropping the message on the floor.
  await page.evaluate(() => {
    // @ts-expect-error -- test-only hook into client.js's module-scope socket
    window.__cairnSocketForTest.send(JSON.stringify({ type: "drop", x: 0.6 }));
  });

  await expect
    .poll(() => frames.some((payload) => JSON.parse(payload).type === "refused"), { timeout: 5000 })
    .toBe(true);

  await expect
    .poll(() => page.locator("#carry-hint").textContent(), { timeout: 5000 })
    .toMatch(/placed.*today|already placed/i);

  await page.close();
});
