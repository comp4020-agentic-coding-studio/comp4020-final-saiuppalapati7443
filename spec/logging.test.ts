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

function waitForLogLine(predicate: (stdout: string) => boolean, timeoutMs = 20_000): Promise<void> {
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

  await waitForLogLine((out) => out.includes("cairn listening"), 20_000);
}, 25_000);

afterAll(() => {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

// A message can arrive the instant the connection opens (the server's
// initial "state" push, sent the moment it accepts the connection) — before
// a `ws.once("open", ...).then(() => ws.once("message", ...))` chain gets a
// chance to attach that second listener. Node's EventEmitter doesn't queue
// an event for a listener that isn't registered yet, so that race can lose
// the "state" push and strand whatever's waiting on it. spec/cairn.test.ts
// hit exactly this (see its own comment) and fixed it with a queue attached
// from the moment the connection is created, not after any `await`; this
// file's first two fixes both missed that `waitForEvent(ws, "open")` then
// `waitForEvent(ws, "message")` still attaches the "message" listener one
// tick too late — the same race, just dressed up with a timeout around it
// instead of actually closing the gap. This is why both earlier fixes still
// timed out intermittently rather than failing fast: the lost message, not
// CPU contention, was the real cause. See CLAUDE.md's dated correction.
interface Conn {
  ws: WebSocket;
  queue: unknown[];
  waiters: Array<(message: unknown) => void>;
  setCookie: string | undefined;
}

function connect(): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const conn: Conn = { ws, queue: [], waiters: [], setCookie: undefined };
    ws.once("upgrade", (res) => {
      const raw = res.headers["set-cookie"];
      conn.setCookie = Array.isArray(raw) ? raw[0] : raw;
    });
    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      const waiter = conn.waiters.shift();
      if (waiter) waiter(message);
      else conn.queue.push(message);
    });
    ws.once("open", () => resolve(conn));
    ws.once("error", reject);
  });
}

function nextMessage<T = unknown>(conn: Conn, timeoutMs = 15_000): Promise<T> {
  const queued = conn.queue.shift();
  if (queued !== undefined) return Promise.resolve(queued as T);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms waiting for a WebSocket message`)),
      timeoutMs,
    );
    conn.waiters.push((message) => {
      clearTimeout(timeout);
      resolve(message as T);
    });
  });
}

// Each it()'s own timeout below is kept comfortably above the sum of its own
// nextMessage()/waitForLogLine() calls, so a slow-but-real pass under
// contention fails with the specific helper message naming what was
// actually slow — never vitest's own generic "Test timed out" with no
// indication which step it was.
it("logs a placement with the pseudonym and handle, and never the cookie id", async () => {
  const conn = await connect();
  await nextMessage(conn); // initial state

  const stoneBroadcast = nextMessage(conn);
  conn.ws.send(JSON.stringify({ type: "drop", x: 0.31 }));
  await stoneBroadcast;
  await waitForLogLine((out) => out.split("\n").some((line) => line.startsWith("place")));

  conn.ws.close();

  const cookieId = conn.setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
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
  const owner = await connect();
  await nextMessage(owner); // initial state

  const ownerStone = nextMessage<{ type: string; stone: { id: number } }>(owner);
  owner.ws.send(JSON.stringify({ type: "drop", x: 0.5 }));
  const { stone } = await ownerStone;

  const attacker = await connect();
  await nextMessage(attacker); // initial state

  attacker.ws.send(JSON.stringify({ type: "edit", id: stone.id, color: "black" }));
  await waitForLogLine((out) =>
    out.split("\n").some((line) => line.startsWith("refuse") && line.includes(`stone #${stone.id}`)),
  );

  owner.ws.close();
  attacker.ws.close();

  const ownerId = owner.setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  const attackerId = attacker.setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  expect(ownerId).toBeTruthy();
  expect(attackerId).toBeTruthy();

  const refuseLine = stdout.split("\n").find((line) => line.startsWith("refuse") && line.includes(`stone #${stone.id}`));
  expect(refuseLine, `expected a "refuse" log line in:\n${stdout}`).toBeTruthy();
  expect(refuseLine).toMatch(/^refuse\s+[a-z]+-[a-z]+#[0-9a-f]{6}\s+tried to edit stone #\d+ owned by [a-z]+-[a-z]+#[0-9a-f]{6}/);

  expect(stdout).not.toContain(ownerId as string);
  expect(stdout).not.toContain(attackerId as string);
}, 60_000);
