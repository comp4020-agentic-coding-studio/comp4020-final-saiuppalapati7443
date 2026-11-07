import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

// Before this test, Enter/Space always dropped at the cairn's horizontal
// centre (client.js's old keydown handler) — a keyboard-only visitor had no
// way to choose where their stone landed, unlike a mouse or touch visitor.
// Only a real browser driving real keydown events against a real #cairn box
// can check this; spec/cairn.test.ts's WebSocket-level checks never render
// anything, and there's no pointer involved at all.
//
// Run against an isolated server (own temp DATA_DIR, own port), the same
// pattern as spec/pile-layout.browser.test.ts: each visitor needs a fresh
// cookie (ADR 0004's one-a-day limit), and a shared app's concurrent drops
// from other spec files would make "lands right/left of centre" unreliable.
let server: ChildProcessWithoutNullStreams;
let port: number;
let dataDir: string;
let browser: Browser;

function startServer(): Promise<ChildProcessWithoutNullStreams> {
  const proc = spawn("node", ["src/server.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
  });
  let stdout = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not boot in time")), 10_000);
    const check = (): void => {
      if (stdout.includes("cairn listening")) {
        clearTimeout(timeout);
        resolve(proc);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

beforeAll(async () => {
  port = 20000 + Math.floor(Math.random() * 10000);
  dataDir = mkdtempSync(join(tmpdir(), "cairn-keyboard-drop-test-"));
  server = await startServer();
  browser = await chromium.launch();
}, 15_000);

afterAll(async () => {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

// A fresh browser context each time gives each visitor its own cookie jar
// (a fresh ADR 0004 identity, with its own one-a-day allowance), the same as
// two separate Chrome profiles.
it("lets a keyboard-only visitor move the drop marker right of centre with ArrowRight", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("#carry-stone");

  const stoneCountBefore = await page.locator(".stone").count();

  await page.locator("#carry-stone").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await page.waitForFunction(
    (before) => document.querySelectorAll(".stone").length > before,
    stoneCountBefore,
    { timeout: 5000 },
  );

  const droppedXFrac = await page.evaluate(() => {
    const cairnRect = document.getElementById("cairn")!.getBoundingClientRect();
    const els = [...document.querySelectorAll(".stone[data-stone-id]")];
    const newest = els.reduce((a, b) =>
      Number(a.getAttribute("data-stone-id")) > Number(b.getAttribute("data-stone-id")) ? a : b,
    );
    const r = newest.getBoundingClientRect();
    return (r.left + r.width / 2 - cairnRect.left) / cairnRect.width;
  });

  // 5 presses at ~5% each should move the marker a clear ~25% right of
  // centre (to roughly 0.75) — a wide margin (0.6) rather than a bare >0.5,
  // so this can't pass on floating-point noise around an unmoved centre.
  expect(droppedXFrac, "5 ArrowRight presses from centre must land right of centre").toBeGreaterThan(0.6);

  await page.close();
  await context.close();
});

it("lets a different keyboard-only visitor move the drop marker left of centre with ArrowLeft", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("#carry-stone");

  const stoneCountBefore = await page.locator(".stone").count();

  await page.locator("#carry-stone").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");

  await page.waitForFunction(
    (before) => document.querySelectorAll(".stone").length > before,
    stoneCountBefore,
    { timeout: 5000 },
  );

  const droppedXFrac = await page.evaluate(() => {
    const cairnRect = document.getElementById("cairn")!.getBoundingClientRect();
    const els = [...document.querySelectorAll(".stone[data-stone-id]")];
    const newest = els.reduce((a, b) =>
      Number(a.getAttribute("data-stone-id")) > Number(b.getAttribute("data-stone-id")) ? a : b,
    );
    const r = newest.getBoundingClientRect();
    return (r.left + r.width / 2 - cairnRect.left) / cairnRect.width;
  });

  // Same wide margin in the other direction (0.4) — centre is ~0.5, so this
  // can't pass on floating-point noise either.
  expect(droppedXFrac, "5 ArrowLeft presses from centre must land left of centre").toBeLessThan(0.4);

  await page.close();
  await context.close();
});
