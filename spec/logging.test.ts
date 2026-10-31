import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterAll, beforeAll, expect, it } from "vitest";

// CLAUDE.md: every action that changes shared state must log who did it, and
// a cookie id must never be logged. That's only checkable against the
// server's actual stdout — which spec/cairn.test.ts's HTTP/WS-level checks
// never see — so this spawns its own short-lived instance (a fresh port and
// DATA_DIR, not the one spec/global-setup.ts found) purely to capture it.
let server: ChildProcessWithoutNullStreams;
let port: number;
let dataDir: string;
let stdout = "";

// Every wait in this file goes through one of these two helpers, each with
// its own generous, explicit timeout and a diagnostic error naming what it
// was actually waiting for — never a bare `await new Promise(...)` with no
// timeout at all. The first version of this file guarded only the final
// "wait for the log line" step with a timeout; every earlier step (the
// WebSocket's own "open" event, draining the initial "state" message) had
// none. Under CI's real contention (several other spec files' own spawned
// servers and Chromium instances competing for the runner's cores), one of
// those unguarded steps ate enough of the test's time budget that vitest's
// own generic 15000ms it() timeout fired first — a confusing "Test timed out
// in 15000ms" with no indication of which step was actually slow, instead of
// a message naming the real wait. See CLAUDE.md's dated correction.
function waitForEvent<T = void>(ws: WebSocket, event: string, timeoutMs = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms waiting for a WebSocket "${event}" event`)),
      timeoutMs,
    );
    ws.once(event, (arg: T) => {
      clearTimeout(timeout);
      resolve(arg);
    });
    // "error" fails the wait immediately regardless of which event was
    // actually being awaited — a dead connection should never just sit
    // there until timeoutMs runs out.
    if (event !== "error") {
      ws.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    }
  });
}

function waitForLogLine(predicate: (stdout: string) => boolean, timeoutMs = 25_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = (): void => {
      if (predicate(stdout)) {
        resolve();
      } else if (Date.now() > deadline) {
        reject(new Error(`timed out after ${timeoutMs}ms waiting for a log line in:\n${stdout}`));
      } else {
        setTimeout(check, 25);
      }
    };
    check();
  });
}

beforeAll(async () => {
  port = 20000 + Math.floor(Math.random() * 10000);
  dataDir = mkdtempSync(join(tmpdir(), "cairn-logging-test-"));
  server = spawn("node", ["src/server.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
  });
  server.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  await waitForLogLine((out) => out.includes("cairn listening"), 15_000);
}, 20_000);

afterAll(() => {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

function captureSetCookie(ws: WebSocket): { setCookie?: string } {
  const captured: { setCookie?: string } = {};
  ws.once("upgrade", (res) => {
    const raw = res.headers["set-cookie"];
    captured.setCookie = Array.isArray(raw) ? raw[0] : raw;
  });
  return captured;
}

async function connectAndDrainState(ws: WebSocket): Promise<void> {
  await waitForEvent(ws, "open");
  await waitForEvent(ws, "message"); // the initial "state" push
}

// Each it()'s own timeout below is kept comfortably above the sum of its
// own waitForEvent()/waitForLogLine() calls (each up to 15000ms), so a
// slow-but-real pass under contention fails with the specific helper
// message naming what was actually slow — never vitest's own generic "Test
// timed out" with no indication which step it was.
it("logs a placement with the pseudonym and handle, and never the cookie id", async () => {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const cookieBox = captureSetCookie(ws);
  await connectAndDrainState(ws);

  const stoneBroadcast = waitForEvent(ws, "message");
  ws.send(JSON.stringify({ type: "drop", x: 0.31 }));
  await stoneBroadcast;
  await waitForLogLine((out) => out.split("\n").some((line) => line.startsWith("place")));

  ws.close();

  const cookieId = cookieBox.setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  expect(cookieId, "test setup should have captured a cookie id to check against").toBeTruthy();

  const placeLine = stdout.split("\n").find((line) => line.startsWith("place"));
  expect(placeLine, `expected a "place" log line in:\n${stdout}`).toBeTruthy();

  // pseudonym#handle, e.g. "quiet-heron#a1b2c3" — a lowercase word, a dash,
  // another lowercase word, a #, then a short hex handle.
  expect(placeLine).toMatch(/^place\s+[a-z]+-[a-z]+#[0-9a-f]{6}\s/);
  expect(placeLine).toContain("stone #");

  expect(stdout).not.toContain(cookieId as string);
}, 60_000);

it("logs a refused mutation attempt naming the stone's real owner, never the cookie id", async () => {
  const owner = new WebSocket(`ws://localhost:${port}/ws`);
  const ownerCookieBox = captureSetCookie(owner);
  await connectAndDrainState(owner);

  const ownerStone = waitForEvent<Buffer | string>(owner, "message").then(
    (data) => JSON.parse(data.toString()) as { type: string; stone: { id: number } },
  );
  owner.send(JSON.stringify({ type: "drop", x: 0.5 }));
  const { stone } = await ownerStone;

  const attacker = new WebSocket(`ws://localhost:${port}/ws`);
  const attackerCookieBox = captureSetCookie(attacker);
  await connectAndDrainState(attacker);

  attacker.send(JSON.stringify({ type: "edit", id: stone.id, color: "black" }));
  await waitForLogLine((out) =>
    out.split("\n").some((line) => line.startsWith("refuse") && line.includes(`stone #${stone.id}`)),
  );

  owner.close();
  attacker.close();

  const ownerId = ownerCookieBox.setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  const attackerId = attackerCookieBox.setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  expect(ownerId).toBeTruthy();
  expect(attackerId).toBeTruthy();

  const refuseLine = stdout.split("\n").find((line) => line.startsWith("refuse") && line.includes(`stone #${stone.id}`));
  expect(refuseLine, `expected a "refuse" log line in:\n${stdout}`).toBeTruthy();
  expect(refuseLine).toMatch(/^refuse\s+[a-z]+-[a-z]+#[0-9a-f]{6}\s+tried to edit stone #\d+ owned by [a-z]+-[a-z]+#[0-9a-f]{6}/);

  expect(stdout).not.toContain(ownerId as string);
  expect(stdout).not.toContain(attackerId as string);
}, 60_000);
