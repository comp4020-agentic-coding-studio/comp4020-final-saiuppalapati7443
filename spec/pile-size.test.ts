import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterAll, beforeAll, expect, it } from "vitest";

// README: "no cap on how large the pile can grow" — the only way to check an
// absence of a cap is to actually push past any plausible small one and
// confirm nothing is rejected, lost, or only partially broadcast. 150 is
// arbitrary but comfortably past any limit that would plausibly be
// accidental (a hardcoded page size, an off-by-one in a fixed-size array),
// while staying fast enough to run in CI.
//
// Run against an isolated server (own temp DATA_DIR, own port), the same
// pattern as spec/persistence.test.ts and spec/logging.test.ts, rather than
// the shared app spec/global-setup.ts finds: vitest runs spec files in
// parallel by default, so other spec/*.test.ts files drop their own stones
// into that shared pile at the same time this test is running — every one
// of those stray broadcasts would land in these 150 sessions' queues too,
// breaking the "every session sees the identical set" assertion below for
// reasons that have nothing to do with a real cap.
let server: ChildProcessWithoutNullStreams;
let port: number;
let dataDir: string;

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
  dataDir = mkdtempSync(join(tmpdir(), "cairn-pile-size-test-"));
  let stdout = "";
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

const VISITOR_COUNT = 150;

it(
  `accepts, stores, and broadcasts ${VISITOR_COUNT} drops from ${VISITOR_COUNT} different visitors, with no cap`,
  async () => {
    // No cookie passed to connect() means a fresh visitor each time — ADR
    // 0004's one-stone-a-day limit is per visitor, so 150 distinct cookies
    // each get to drop once, same as 150 separate browser profiles would.
    const sessions = await Promise.all(Array.from({ length: VISITOR_COUNT }, () => connect()));
    await Promise.all(sessions.map((session) => nextMessage(session))); // initial state, one each

    // Every session must see every one of the 150 drops, not just its own —
    // that's what "broadcast" means, not merely "accepted." Each session
    // queues up VISITOR_COUNT waits before any drop is sent, so none of the
    // 150 simultaneous broadcasts can race ahead of a listener not yet
    // attached.
    const allBroadcasts = sessions.map((session) =>
      Promise.all(Array.from({ length: VISITOR_COUNT }, () => nextMessage(session))),
    );

    for (const session of sessions) {
      session.ws.send(JSON.stringify({ type: "drop", x: Math.random() }));
    }

    const perSessionMessages = await Promise.all(allBroadcasts);

    const idsPerSession = perSessionMessages.map((messages) =>
      messages
        .filter((message): message is StoneMessage => message.type === "stone")
        .map((message) => message.stone.id)
        .sort((a, b) => a - b),
    );

    const [expectedIds, ...rest] = idsPerSession;
    expect(expectedIds, "every session must have received exactly one stone per drop").toHaveLength(
      VISITOR_COUNT,
    );
    expect(new Set(expectedIds).size, "every stone id must be distinct — no drop silently merged or skipped").toBe(
      VISITOR_COUNT,
    );
    for (const ids of rest) {
      expect(ids, "every session must see the identical set of stones, not just its own drop").toEqual(
        expectedIds,
      );
    }

    // A brand-new session arriving after the fact must also see the full
    // pile in its initial "state" snapshot — stored, not just broadcast live.
    const observer = await connect();
    const state = await nextMessage(observer);
    if (state.type !== "state") throw new Error("expected initial state");
    const storedIds = new Set(state.stones.map((stone) => stone.id));
    for (const id of expectedIds) {
      expect(storedIds.has(id), `stone #${id} must be present in a fresh session's stored state`).toBe(true);
    }

    for (const session of [...sessions, observer]) session.ws.close();
  },
  30_000,
);
