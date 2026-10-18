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

// A message can arrive the instant the connection opens (the initial
// "state" push), before test code gets a chance to attach a listener for
// it — a plain `ws.once("message", ...)` added after the fact can miss it.
// So every message is queued from the moment of connect(), and callers pull
// from that queue (or wait on it) instead of racing a fresh listener each time.
interface Conn {
  ws: WebSocket;
  queue: ServerMessage[];
  waiters: Array<(message: ServerMessage) => void>;
  setCookie: string | undefined;
}

// `cookie` simulates one browser's cookie jar: pass none for a brand-new
// visitor (like a fresh Chrome profile), or a previous connection's
// `setCookie` to act as the same visitor reconnecting — or a hand-crafted
// value to simulate a tampered one. Two separate `connect()` call sites with
// no cookie passed between them are exactly "two separate Chrome profiles."
function connect(cookie?: string): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, cookie ? { headers: { cookie } } : undefined);
    const conn: Conn = { ws, queue: [], waiters: [], setCookie: undefined };
    ws.once("upgrade", (res) => {
      const raw = res.headers["set-cookie"];
      conn.setCookie = Array.isArray(raw) ? raw[0] : raw;
    });
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
  a.ws.send(JSON.stringify({ type: "drop", x:0.42 }));

  const message = await incoming;
  expect(message.type).toBe("stone");
  expect(message.type === "stone" && message.stone.x).toBeCloseTo(0.42);

  a.ws.close();
  b.ws.close();
});

// Dropping a stone is the only action in Cairn that changes shared state
// (carrying a stone is local-only drag feedback, never sent over /ws — see
// ADR 0002, presence is passive via landed stones, not a cursor broadcast).
// This measures that the one state-changing action actually lands elsewhere
// within the second the brief and README promise, rather than just resolving
// eventually. The listener is attached (nextMessage(b) called) before a's
// send, so this can't fall into the crit-8 race of missing a message that
// arrived before anything was listening for it.
it("delivers a dropped stone to another open session within 1000ms", async () => {
  const a = await connect();
  const b = await connect();
  await nextMessage(a);
  await nextMessage(b);

  const incoming = nextMessage(b);
  const start = performance.now();
  a.ws.send(JSON.stringify({ type: "drop", x:0.55 }));

  const message = await incoming;
  const elapsed = performance.now() - start;
  expect(message.type).toBe("stone");
  expect(elapsed).toBeLessThan(1000);

  a.ws.close();
  b.ws.close();
});

// Protects docs/adr/0003-carry-stays-local.md: carrying a stone must never
// reach another session as a live broadcast, only a completed drop may. A
// message shaped like an in-progress carry/position update is dropped the
// same as any other message type this server doesn't recognise. Checking the
// queue directly after a wait, rather than racing a fresh listener against a
// timeout, avoids leaving a stray waiter behind that would steal the next
// real message out from under the following assertion (the crit-8 race, in
// reverse).
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
  a.ws.send(JSON.stringify({ type: "drop", x:0.33 }));
  const message = await validDrop;
  expect(message.type === "stone" && message.stone.x).toBeCloseTo(0.33);
  expect(a.ws.readyState).toBe(WebSocket.OPEN);

  a.ws.close();
  b.ws.close();
});

// Five sessions, two of them dropping at the same instant (no await between
// the two sends), all converging on the same two new stones in whatever order
// they arrive in. Listeners are attached on every session before either send,
// same rule as above.
it("keeps five simultaneous sessions consistent, including two dropping at once", async () => {
  const sessions = await Promise.all(Array.from({ length: 5 }, () => connect()));
  await Promise.all(sessions.map((session) => nextMessage(session)));

  const waits = sessions.map((session) => Promise.all([nextMessage(session), nextMessage(session)]));
  sessions[0].ws.send(JSON.stringify({ type: "drop", x:0.2 }));
  sessions[1].ws.send(JSON.stringify({ type: "drop", x:0.8 }));

  const perSession = await Promise.all(waits);
  const idsPerSession = perSession.map((pair) =>
    pair
      .filter((message): message is StoneMessage => message.type === "stone")
      .map((message) => message.stone.id)
      .sort((a, b) => a - b),
  );

  const [expectedIds, ...rest] = idsPerSession;
  expect(expectedIds).toHaveLength(2);
  for (const ids of rest) expect(ids).toEqual(expectedIds);

  // A sixth, brand-new session must land on the same state too, not just the
  // five that were already open when the two drops happened.
  const sixth = await connect();
  const state = await nextMessage(sixth);
  if (state.type !== "state") throw new Error("expected initial state");
  const stateIds = state.stones.map((stone) => stone.id);
  for (const id of expectedIds) expect(stateIds).toContain(id);

  for (const session of [...sessions, sixth]) session.ws.close();
});

// Simulates a visitor's connection dropping (network loss, laptop sleeping,
// a tab backgrounded long enough to be killed) and confirms the same recovery
// path client.js already uses on its own `ws` "close" event — reconnect, then
// read whatever the ordinary initial "state" push contains — actually shows
// everything that landed while it was gone. No reload, no special
// reconnect-only message type.
//
// Three WebSocket connects happen sequentially here (a, then b, then the
// reconnect), each a real TLS handshake once this runs against a deployed
// APP_URL rather than localhost — that alone took ~5s against the live Fly
// deployment and tripped vitest's 5000ms default, with every assertion inside
// still passing. An explicit timeout, not a tighter retry, is the fix: the
// behaviour was never slow, the default budget was just sized for localhost.
// b and c are two distinct visitors (separate cookies), each dropping once,
// while a is disconnected — not the same visitor dropping twice, which
// ADR 0004's one-stone-a-day limit would now silently reject.
it("catches up on reconnect after a dropped connection, without a reload", async () => {
  const a = await connect();
  await nextMessage(a);
  const b = await connect();
  await nextMessage(b);

  const aClosed = new Promise((resolve) => a.ws.once("close", resolve));
  a.ws.close();
  await aClosed;

  const c = await connect();
  await nextMessage(c);

  const missed = Promise.all([nextMessage(b), nextMessage(b)]);
  b.ws.send(JSON.stringify({ type: "drop", x: 0.15 }));
  c.ws.send(JSON.stringify({ type: "drop", x: 0.85 }));
  const missedMessages = await missed;
  const missedIds = missedMessages
    .filter((message): message is StoneMessage => message.type === "stone")
    .map((message) => message.stone.id);
  expect(missedIds).toHaveLength(2);

  const reconnected = await connect();
  const state = await nextMessage(reconnected);
  if (state.type !== "state") throw new Error("expected initial state");
  const stateIds = state.stones.map((stone) => stone.id);
  for (const id of missedIds) expect(stateIds).toContain(id);

  b.ws.close();
  c.ws.close();
  reconnected.ws.close();
}, 15000);

it("shows a freshly opened session every stone dropped before it connected", async () => {
  const first = await connect();
  await nextMessage(first);

  const dropped = nextMessage(first);
  first.ws.send(JSON.stringify({ type: "drop", x:0.1 }));
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

  a.ws.send(JSON.stringify({ type: "drop", x: 5 }));
  a.ws.send(JSON.stringify({ type: "drop", x: "0.5" }));
  a.ws.send(JSON.stringify({ type: "carry", x: 0.5 }));
  a.ws.send("not even json");

  // Prove the connection is still alive, and that none of the above landed,
  // by making one valid drop and confirming it's the only thing that arrives.
  const validDrop = nextMessage(b);
  a.ws.send(JSON.stringify({ type: "drop", x:0.77 }));
  const message = await validDrop;
  expect(message.type === "stone" && message.stone.x).toBeCloseTo(0.77);
  expect(a.ws.readyState).toBe(WebSocket.OPEN);

  a.ws.close();
  b.ws.close();
});

// ADR 0004 limits a visitor to one drop a day, so "the same visitor across
// separate drops" is now checked across a reconnect with the same
// server-issued cookie (same visitor, two sessions) rather than two drops in
// one session (which the daily limit would reject the second of).
it("gives the same visitor the same color across a reconnect", async () => {
  const a = await connect();
  await nextMessage(a);

  const dropped = nextMessage(a);
  a.ws.send(JSON.stringify({ type: "drop", x: 0.3 }));
  const droppedMessage = await dropped;
  if (droppedMessage.type !== "stone") throw new Error("expected a stone broadcast");
  a.ws.close();

  const again = await connect(a.setCookie);
  const state = await nextMessage(again);
  if (state.type !== "state") throw new Error("expected initial state");
  const mine = state.stones.find((stone) => stone.id === droppedMessage.stone.id);
  expect(mine?.color).toBe(droppedMessage.stone.color);

  again.ws.close();
});

// --- docs/adr/0004-who-may-see-and-change-what.md -------------------------
//
// Two cookie jars (a and b), standing in for two separate Chrome profiles:
// each `connect()` call with no cookie argument is a fresh visitor, exactly
// like opening the app in a browser that's never been there before. The
// server, not either client, decides who they are and what they may do.

it("tells two visitors apart by a server-set cookie, not by anything they send", async () => {
  const a = await connect();
  const b = await connect();

  expect(a.setCookie, "a fresh connection must get a Set-Cookie").toBeTruthy();
  expect(b.setCookie, "a fresh connection must get a Set-Cookie").toBeTruthy();
  expect(a.setCookie).not.toBe(b.setCookie);

  a.ws.close();
  b.ws.close();
});

it("each visitor sees the other's stone live, but only their own is marked mine", async () => {
  const a = await connect();
  const b = await connect();
  await nextMessage(a);
  await nextMessage(b);

  const aSeesItsOwn = nextMessage(a);
  const bSeesAs = nextMessage(b);
  a.ws.send(JSON.stringify({ type: "drop", x: 0.4 }));

  const [fromA, fromB] = await Promise.all([aSeesItsOwn, bSeesAs]);
  if (fromA.type !== "stone" || fromB.type !== "stone") throw new Error("expected stone broadcasts");
  expect(fromA.stone.id).toBe(fromB.stone.id);
  expect(fromA.stone.mine, "the dropping visitor must see their own stone as mine").toBe(true);
  expect(fromB.stone.mine, "a different visitor must never see someone else's stone as mine").toBe(false);

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

it("ignores a forged visitorId, name, mine, or id in the drop body", async () => {
  const a = await connect();
  const b = await connect();
  await nextMessage(a);
  await nextMessage(b);

  const seenByA = nextMessage(a);
  const seenByB = nextMessage(b);
  a.ws.send(
    JSON.stringify({
      type: "drop",
      x: 0.25,
      visitorId: "11111111-1111-1111-1111-111111111111",
      name: "eve",
      mine: true,
      id: 999999,
    }),
  );
  const [fromA, fromB] = await Promise.all([seenByA, seenByB]);
  if (fromA.type !== "stone" || fromB.type !== "stone") throw new Error("expected stone broadcasts");

  // The forged fields must have had no effect: the stone is still recorded
  // against a's real cookie identity (so a, the actual dropper, still sees
  // it as mine — a server that instead trusted the forged visitorId would
  // attribute the stone to that id and this would flip to false), the id is
  // server-chosen (not 999999), and b — who didn't send the drop — never
  // sees it as mine either.
  expect(fromA.stone.id).not.toBe(999999);
  expect(fromA.stone.mine, "the real dropper must still see their own stone as mine").toBe(true);
  expect(fromB.stone.mine).toBe(false);

  a.ws.close();
  b.ws.close();
});

it("gives a tampered cookie a brand-new identity, never someone else's", async () => {
  const real = await connect();
  await nextMessage(real);

  const tampered = await connect("cairn_visitor=not-a-uuid-at-all");
  expect(
    tampered.setCookie,
    "a cookie that isn't a valid id must be replaced with a freshly minted one",
  ).toBeTruthy();
  await nextMessage(tampered);

  const realDrops = nextMessage(real);
  const tamperedSeesIt = nextMessage(tampered);
  real.ws.send(JSON.stringify({ type: "drop", x: 0.6 }));
  const [realStone, seenByTampered] = await Promise.all([realDrops, tamperedSeesIt]);
  if (realStone.type !== "stone" || seenByTampered.type !== "stone") {
    throw new Error("expected stone broadcasts");
  }
  // The tampered-cookie visitor is a distinct identity: it sees the real
  // visitor's stone, but never as its own.
  expect(seenByTampered.stone.mine).toBe(false);

  const tamperedDrops = nextMessage(tampered);
  tampered.ws.send(JSON.stringify({ type: "drop", x: 0.7 }));
  const tamperedStone = await tamperedDrops;
  if (tamperedStone.type !== "stone") throw new Error("expected a stone broadcast");
  expect(tamperedStone.stone.color).not.toBe(realStone.stone.color);

  real.ws.close();
  tampered.ws.close();
});

it("never includes a cookie id anywhere in a response", async () => {
  const a = await connect();
  const state = await nextMessage(a);
  if (state.type !== "state") throw new Error("expected initial state");

  const dropped = nextMessage(a);
  a.ws.send(JSON.stringify({ type: "drop", x: 0.5 }));
  const stoneMessage = await dropped;

  const cookieId = a.setCookie?.match(/cairn_visitor=([^;]+)/)?.[1];
  expect(cookieId, "test setup should have captured a cookie id to check against").toBeTruthy();

  for (const payload of [state, stoneMessage]) {
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain(cookieId);
    expect(serialised).not.toMatch(/visitorId/i);
  }

  a.ws.close();
});
