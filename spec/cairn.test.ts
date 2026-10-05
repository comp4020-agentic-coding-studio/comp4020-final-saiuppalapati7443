import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { expect, inject, it } from "vitest";

// README's checkable promises for Cairn, run against the running app — same
// spirit as invariants.test.ts, but over the /ws protocol rather than HTTP.
const baseUrl = inject("baseUrl");
const wsUrl = new URL(baseUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
wsUrl.pathname = "/ws";

interface StoneWire {
  id: number;
  color: string;
  x: number;
  rotation: number;
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

// A message can arrive the instant the connection opens (the initial
// "state" push), before test code gets a chance to attach a listener for
// it — a plain `ws.once("message", ...)` added after the fact can miss it.
// So every message is queued from the moment of connect(), and callers pull
// from that queue (or wait on it) instead of racing a fresh listener each time.
interface Conn {
  ws: WebSocket;
  queue: ServerMessage[];
  waiters: Array<(message: ServerMessage) => void>;
}

function connect(): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
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

it("broadcasts a dropped stone to every other open session within about a second", async () => {
  const a = await connect();
  const b = await connect();
  await nextMessage(a);
  await nextMessage(b);

  const incoming = nextMessage(b);
  a.ws.send(JSON.stringify({ type: "drop", visitorId: randomUUID(), x: 0.42 }));

  const message = await incoming;
  expect(message.type).toBe("stone");
  expect(message.type === "stone" && message.stone.x).toBeCloseTo(0.42);

  a.ws.close();
  b.ws.close();
});

it("shows a freshly opened session every stone dropped before it connected", async () => {
  const first = await connect();
  await nextMessage(first);

  const dropped = nextMessage(first);
  first.ws.send(JSON.stringify({ type: "drop", visitorId: randomUUID(), x: 0.1 }));
  const droppedMessage = await dropped;
  if (droppedMessage.type !== "stone") throw new Error("expected a stone broadcast");

  const second = await connect();
  const state = await nextMessage(second);
  if (state.type !== "state") throw new Error("expected initial state");
  expect(state.stones.some((stone) => stone.id === droppedMessage.stone.id)).toBe(true);

  first.ws.close();
  second.ws.close();
});

it("ignores a malformed drop instead of broadcasting it or dropping the connection", async () => {
  const a = await connect();
  const b = await connect();
  await nextMessage(a);
  await nextMessage(b);

  a.ws.send(JSON.stringify({ type: "drop", visitorId: "not-a-uuid", x: 0.5 }));
  a.ws.send(JSON.stringify({ type: "drop", visitorId: randomUUID(), x: 5 }));
  a.ws.send("not even json");

  // Prove the connection is still alive, and that none of the above landed,
  // by making one valid drop and confirming it's the only thing that arrives.
  const validDrop = nextMessage(b);
  a.ws.send(JSON.stringify({ type: "drop", visitorId: randomUUID(), x: 0.77 }));
  const message = await validDrop;
  expect(message.type === "stone" && message.stone.x).toBeCloseTo(0.77);
  expect(a.ws.readyState).toBe(WebSocket.OPEN);

  a.ws.close();
  b.ws.close();
});

it("gives the same visitor the same color across separate drops", async () => {
  const a = await connect();
  await nextMessage(a);
  const visitorId = randomUUID();

  const first = nextMessage(a);
  a.ws.send(JSON.stringify({ type: "drop", visitorId, x: 0.3 }));
  const firstMessage = await first;
  if (firstMessage.type !== "stone") throw new Error("expected a stone broadcast");

  const second = nextMessage(a);
  a.ws.send(JSON.stringify({ type: "drop", visitorId, x: 0.6 }));
  const secondMessage = await second;
  if (secondMessage.type !== "stone") throw new Error("expected a stone broadcast");

  expect(firstMessage.stone.color).toBe(secondMessage.stone.color);

  a.ws.close();
});
