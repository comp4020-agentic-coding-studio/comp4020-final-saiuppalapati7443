import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { WebSocket } from "ws";
import { afterAll, beforeAll, expect, it } from "vitest";

// client.js stacks stones in a fixed "world" coordinate space so the same
// pile renders at the same *fractional* position on every viewport (see the
// comment above WORLD_WIDTH in client.js) — only a real browser at two
// different real viewport sizes can actually check that claim; spec/cairn.
// test.ts's WebSocket-level checks never render anything, and
// spec/reconnect.browser.test.ts only ever opens one viewport size.
//
// Run against an isolated server (own temp DATA_DIR, own port), the same
// pattern as spec/persistence.test.ts and spec/logging.test.ts, rather than
// the shared app spec/global-setup.ts finds: other spec/*.browser.test.ts
// files drop their own stones into that shared pile concurrently, which
// would make "the same pile" impossible to guarantee between two page loads
// moments apart.
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

interface StoneWire {
  id: number;
  x: number;
}

// Drops one stone over a fresh WS connection (a fresh cookie each time, so
// ADR 0004's one-a-day limit never blocks the next drop) and resolves with
// the server-assigned stone, same shape spec/cairn.test.ts uses.
function dropStone(x: number): Promise<StoneWire> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.once("open", () => {
      ws.once("message", () => {
        // initial state; now drop
        ws.once("message", (data) => {
          const message = JSON.parse(data.toString()) as { type: string; stone?: StoneWire };
          ws.close();
          if (message.type !== "stone" || !message.stone) {
            reject(new Error("expected a stone broadcast"));
            return;
          }
          resolve(message.stone);
        });
        ws.send(JSON.stringify({ type: "drop", x }));
      });
    });
    ws.once("error", reject);
  });
}

interface StoneFraction {
  id: string;
  xFrac: number;
  yFrac: number;
}

// Every .stone's centre as a fraction of #cairn's own box — the thing that
// must match between viewports, since raw pixel position obviously won't.
// scrollTop is added back in so a stone currently scrolled out of view still
// reports where it "really" sits in the pile, not just in the visible port.
async function stoneFractions(page: Page): Promise<StoneFraction[]> {
  return page.evaluate(() => {
    const cairnEl = document.getElementById("cairn")!;
    const cairnRect = cairnEl.getBoundingClientRect();
    return [...document.querySelectorAll(".stone[data-stone-id]")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-stone-id")!,
        xFrac: (r.left + r.width / 2 - cairnRect.left) / cairnRect.width,
        yFrac: (r.top + r.height / 2 - cairnRect.top + cairnEl.scrollTop) / cairnRect.height,
      };
    });
  });
}

beforeAll(async () => {
  port = 20000 + Math.floor(Math.random() * 10000);
  dataDir = mkdtempSync(join(tmpdir(), "cairn-pile-layout-test-"));
  server = await startServer();
  browser = await chromium.launch();
}, 15_000);

afterAll(async () => {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

it("renders the same pile at the same fractional position on a phone and a desktop viewport", async () => {
  for (const x of [0.15, 0.2, 0.3, 0.45, 0.5, 0.55, 0.7, 0.8, 0.85]) {
    await dropStone(x);
  }

  // 390x844 and 1920x1080 are the course's two marking viewports (see
  // docs/testing/final-marker-pass.md) — the pile has to match exactly
  // between the two sizes markers actually use, not just any two sizes.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`http://localhost:${port}/`);
  await phone.waitForFunction(() => document.querySelectorAll(".stone").length >= 9, undefined, { timeout: 10_000 });
  await phone.waitForTimeout(500); // let the landing transition settle
  const phoneFractions = await stoneFractions(phone);
  await phone.close();

  const desktop = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await desktop.goto(`http://localhost:${port}/`);
  await desktop.waitForFunction(() => document.querySelectorAll(".stone").length >= 9, undefined, {
    timeout: 10_000,
  });
  await desktop.waitForTimeout(500);
  const desktopFractions = await stoneFractions(desktop);
  await desktop.close();

  expect(phoneFractions).toHaveLength(9);
  expect(desktopFractions).toHaveLength(9);

  const desktopById = new Map(desktopFractions.map((s) => [s.id, s]));
  for (const phoneStone of phoneFractions) {
    const desktopStone = desktopById.get(phoneStone.id);
    expect(desktopStone, `stone #${phoneStone.id} must appear in both viewports`).toBeTruthy();
    expect(
      phoneStone.xFrac,
      `stone #${phoneStone.id}'s horizontal position must match between viewports`,
    ).toBeCloseTo(desktopStone!.xFrac, 2);
    expect(
      phoneStone.yFrac,
      `stone #${phoneStone.id}'s vertical position must match between viewports`,
    ).toBeCloseTo(desktopStone!.yFrac, 2);
  }
}, 20_000);

it("lands a live drop from one session at the same relative spot on another session at a different viewport", async () => {
  // Seed a small pile first so the live drop has something real to stack on,
  // same as the test above, but on fresh sessions of this same isolated
  // server (stones from the previous test are still there — that's fine,
  // this only checks the newest stone's own relative position).
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`http://localhost:${port}/`);
  await phone.waitForSelector("#carry-stone");

  const desktop = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await desktop.goto(`http://localhost:${port}/`);
  await desktop.waitForSelector("#carry-stone");

  const beforeCount = await phone.locator(".stone").count();

  // Drop from the phone session's own carry stone, the real drag path.
  const carryBox = await phone.locator("#carry-stone").boundingBox();
  const cairnBox = await phone.locator("#cairn").boundingBox();
  if (!carryBox || !cairnBox) throw new Error("expected both elements to be visible");
  await phone.mouse.move(carryBox.x + carryBox.width / 2, carryBox.y + carryBox.height / 2);
  await phone.mouse.down();
  await phone.mouse.move(cairnBox.x + cairnBox.width * 0.4, cairnBox.y + cairnBox.height * 0.5, { steps: 5 });
  await phone.mouse.up();

  await phone.waitForFunction(
    (before) => document.querySelectorAll(".stone").length > before,
    beforeCount,
    { timeout: 5000 },
  );
  await desktop.waitForFunction(
    (before) => document.querySelectorAll(".stone").length > before,
    beforeCount,
    { timeout: 5000 },
  );
  await phone.waitForTimeout(500);
  await desktop.waitForTimeout(500);

  const newStoneId = await phone.evaluate(() => {
    const els = [...document.querySelectorAll(".stone[data-stone-id]")];
    const ids = els.map((el) => Number(el.getAttribute("data-stone-id")));
    return String(Math.max(...ids));
  });

  const phoneFractions = await stoneFractions(phone);
  const desktopFractions = await stoneFractions(desktop);
  const phoneStone = phoneFractions.find((s) => s.id === newStoneId);
  const desktopStone = desktopFractions.find((s) => s.id === newStoneId);
  expect(phoneStone, "the dropped stone must render on the dropping session").toBeTruthy();
  expect(desktopStone, "the dropped stone must render on the other session too").toBeTruthy();

  expect(phoneStone!.xFrac).toBeCloseTo(desktopStone!.xFrac, 2);
  expect(phoneStone!.yFrac).toBeCloseTo(desktopStone!.yFrac, 2);

  await phone.close();
  await desktop.close();
}, 15_000);
