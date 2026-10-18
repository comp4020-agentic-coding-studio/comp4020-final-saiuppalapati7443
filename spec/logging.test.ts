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

beforeAll(async () => {
  port = 20000 + Math.floor(Math.random() * 10000);
  dataDir = mkdtempSync(join(tmpdir(), "cairn-logging-test-"));
  server = spawn("node", ["src/server.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
  });
  server.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not boot in time")), 10_000);
    const check = (): void => {
      if (stdout.includes("cairn listening")) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}, 15_000);

afterAll(() => {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

it("logs a placement with the pseudonym and handle, and never the cookie id", async () => {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  let setCookie: string | undefined;
  ws.once("upgrade", (res) => {
    const raw = res.headers["set-cookie"];
    setCookie = Array.isArray(raw) ? raw[0] : raw;
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  await new Promise<void>((resolve) => ws.once("message", () => resolve())); // drain initial state

  const stoneBroadcast = new Promise<void>((resolve) => ws.once("message", () => resolve()));
  ws.send(JSON.stringify({ type: "drop", x: 0.31 }));
  await stoneBroadcast;
  await new Promise((resolve) => setTimeout(resolve, 200)); // let the log line flush

  ws.close();

  const cookieId = setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  expect(cookieId, "test setup should have captured a cookie id to check against").toBeTruthy();

  const placeLine = stdout.split("\n").find((line) => line.startsWith("place"));
  expect(placeLine, `expected a "place" log line in:\n${stdout}`).toBeTruthy();

  // pseudonym#handle, e.g. "quiet-heron#a1b2c3" — a lowercase word, a dash,
  // another lowercase word, a #, then a short hex handle.
  expect(placeLine).toMatch(/^place\s+[a-z]+-[a-z]+#[0-9a-f]{6}\s/);
  expect(placeLine).toContain("stone #");

  expect(stdout).not.toContain(cookieId as string);
});

it("logs a refused mutation attempt naming the stone's real owner, never the cookie id", async () => {
  const owner = new WebSocket(`ws://localhost:${port}/ws`);
  let ownerCookie: string | undefined;
  owner.once("upgrade", (res) => {
    const raw = res.headers["set-cookie"];
    ownerCookie = Array.isArray(raw) ? raw[0] : raw;
  });
  await new Promise<void>((resolve, reject) => {
    owner.once("open", resolve);
    owner.once("error", reject);
  });
  await new Promise<void>((resolve) => owner.once("message", () => resolve()));

  const ownerStone = new Promise<{ type: string; stone: { id: number } }>((resolve) =>
    owner.once("message", (data) => resolve(JSON.parse(data.toString()))),
  );
  owner.send(JSON.stringify({ type: "drop", x: 0.5 }));
  const { stone } = await ownerStone;

  const attacker = new WebSocket(`ws://localhost:${port}/ws`);
  let attackerCookie: string | undefined;
  attacker.once("upgrade", (res) => {
    const raw = res.headers["set-cookie"];
    attackerCookie = Array.isArray(raw) ? raw[0] : raw;
  });
  await new Promise<void>((resolve, reject) => {
    attacker.once("open", resolve);
    attacker.once("error", reject);
  });
  await new Promise<void>((resolve) => attacker.once("message", () => resolve()));

  attacker.send(JSON.stringify({ type: "edit", id: stone.id, color: "black" }));
  await new Promise((resolve) => setTimeout(resolve, 300));

  owner.close();
  attacker.close();

  const ownerId = ownerCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  const attackerId = attackerCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  expect(ownerId).toBeTruthy();
  expect(attackerId).toBeTruthy();

  const refuseLine = stdout.split("\n").find((line) => line.startsWith("refuse") && line.includes(`stone #${stone.id}`));
  expect(refuseLine, `expected a "refuse" log line in:\n${stdout}`).toBeTruthy();
  expect(refuseLine).toMatch(/^refuse\s+[a-z]+-[a-z]+#[0-9a-f]{6}\s+tried to edit stone #\d+ owned by [a-z]+-[a-z]+#[0-9a-f]{6}/);

  expect(stdout).not.toContain(ownerId as string);
  expect(stdout).not.toContain(attackerId as string);
});
