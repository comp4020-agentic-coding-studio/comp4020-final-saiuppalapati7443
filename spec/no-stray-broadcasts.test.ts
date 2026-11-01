import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterAll, beforeAll, expect, it } from "vitest";

// Both tests in this file prove a negative: that a specific action (a carry,
// a move/edit/delete attempt) causes NO broadcast at all, by waiting a fixed
// interval and then asserting a connection's queue is empty. That assertion
// only means what it claims to mean if the connection's queue can't receive
// any OTHER broadcast during the wait — which the shared app
// spec/global-setup.ts finds can't guarantee: vitest runs spec files (and
// the tests within a file) with real concurrency, so another spec/*.test.ts
// file's own real drop landing in the wait window produces the exact same
// symptom (a non-empty queue) as a real bug would, for a reason that has
// nothing to do with carry or move/edit/delete. That's exactly the race
// spec/pile-size.test.ts's own isolated-server comment already describes —
// these two tests had the same exposure and were moved here for the same
// reason, after one of them (the carry test) failed once in a full `pnpm
// check` run and passed again in isolation, which is what a stray broadcast
// from a concurrently-running test looks like, not a real regression. See
// CLAUDE.md's dated correction.
let server: ChildProcessWithoutNullStreams;
let port: number;
let dataDir: string;

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
  color: string;
  x: number;
  rotation: number;
  mine: boolean;
}
interface StateMessage {
  type: "state";
  stones: StoneWire[];
}
interface StoneMessage {
  type: "stone";
  stone: StoneWire;
}
type ServerMessage = StateMessage | StoneMessage;

// Same message-queue pattern as spec/cairn.test.ts: a message can arrive the
// instant the connection opens, before a caller gets a chance to attach a
// listener for it, so every message is queued from the moment of connect()
// rather than raced against a fresh one-shot listener.
interface Conn {
  ws: WebSocket;
  queue: ServerMessage[];
  waiters: Array<(message: ServerMessage) => void>;
}

function connect(): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const conn: Conn = { ws, queue: [], waiters: [] };
    ws.on("message", (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      const waiter = conn.waiters.shift();
      if (waiter) waiter(message);
      else conn.queue.push(message);
    });
    ws.once("open", () => resolve(conn));
    ws.once("error", reject);
  });
}

function nextMessage(conn: Conn): Promise<ServerMessage> {
  const queued = conn.queue.shift();
  if (queued) return Promise.resolve(queued);
  return new Promise((resolve) => conn.waiters.push(resolve));
}

beforeAll(async () => {
  port = 20000 + Math.floor(Math.random() * 10000);
  dataDir = mkdtempSync(join(tmpdir(), "cairn-no-stray-broadcasts-test-"));
  server = await startServer();
}, 15_000);

afterAll(() => {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

// Protects docs/adr/0003-carry-stays-local.md: carrying a stone must never
// reach another session as a live broadcast, only a completed drop may. A
// message shaped like an in-progress carry/position update is dropped the
// same as any other message type this server doesn't recognise.
it("never broadcasts a carry/in-progress drag, only a completed drop (ADR 0003)", async () => {
  const a = await connect();
  const b = await connect();
  await nextMessage(a);
  await nextMessage(b);

  a.ws.send(JSON.stringify({ type: "carry", x: 0.5 }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(b.queue).toHaveLength(0);

  // Prove the connection is still alive, and that a real drop still works.
  const validDrop = nextMessage(b);
  a.ws.send(JSON.stringify({ type: "drop", x: 0.33 }));
  const message = await validDrop;
  expect(message.type === "stone" && message.stone.x).toBeCloseTo(0.33);
  expect(a.ws.readyState).toBe(WebSocket.OPEN);

  a.ws.close();
  b.ws.close();
});

// There is no message type for moving, editing, or deleting a stone at all
// (ADR 0004: nobody may, ever, not even the owner) — so "B cannot move, edit
// or delete A's stone" is checked by confirming the server ignores anything
// shaped like an attempt, from anyone, the same way it ignores any other
// message type it doesn't recognise, and that A's stone is unchanged after.
it("B cannot move, edit, or delete A's stone — there is no such message to send", async () => {
  const a = await connect();
  const b = await connect();
  await nextMessage(a);
  await nextMessage(b);

  const aDrops = nextMessage(a);
  const bSeesADrop = nextMessage(b);
  a.ws.send(JSON.stringify({ type: "drop", x: 0.5 }));
  const aStone = await aDrops;
  await bSeesADrop; // A's own drop also reaches B; drain it before checking B's queue below.
  if (aStone.type !== "stone") throw new Error("expected a stone broadcast");

  for (const attempt of [
    { type: "move", id: aStone.stone.id, x: 0.9 },
    { type: "edit", id: aStone.stone.id, color: "hsl(0, 0%, 0%)" },
    { type: "delete", id: aStone.stone.id },
  ]) {
    b.ws.send(JSON.stringify(attempt));
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(b.queue, "none of B's attempts should have been broadcast to anyone").toHaveLength(0);

  const check = await connect();
  const state = await nextMessage(check);
  if (state.type !== "state") throw new Error("expected initial state");
  const stillThere = state.stones.find((stone) => stone.id === aStone.stone.id);
  expect(stillThere?.x).toBeCloseTo(0.5);
  expect(stillThere?.color).toBe(aStone.stone.color);

  a.ws.close();
  b.ws.close();
  check.ws.close();
});
