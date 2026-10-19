import { createServer, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { findStone, hasDroppedToday, insertStone, listStones, type Stone } from "./db.ts";
import { renderMarkdown } from "./readme.ts";
import { serveFile } from "./static.ts";
import { isSecureRequest, resolveVisitor, setCookieHeader } from "./identity.ts";
import { logEvent } from "./log.ts";
import { publicId } from "./pseudonym.ts";

const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const DOCS_DIR = fileURLToPath(new URL("../docs", import.meta.url));
const README_PATH = fileURLToPath(new URL("../README.md", import.meta.url));

interface DropMessage {
  type: "drop";
  x: number;
}

// Anything arriving over the socket is untrusted: the wrong shape, or an x
// outside [0, 1], is rejected here and never reaches node:sqlite or another
// client. ADR 0004: identity is never read from the message body — a
// `visitorId`, `name`, `mine`, or `id` field here is simply never looked at,
// forged or not, so there's nothing to validate it against.
function parseDrop(value: unknown): DropMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const msg = value as Record<string, unknown>;
  if (
    msg.type === "drop" &&
    typeof msg.x === "number" &&
    Number.isFinite(msg.x) &&
    msg.x >= 0 &&
    msg.x <= 1
  ) {
    return { type: "drop", x: msg.x };
  }
  return null;
}

interface HelloMessage {
  type: "hello";
  width: number;
  height: number;
}

// A client reports its own viewport once, right after connecting, purely so
// an arrival can be logged with it (CLAUDE.md: every action that changes
// shared state is logged — arriving isn't one, but it's what the crit's
// narration needs to say "who showed up, on what"). Bounded generously
// (real viewports, not an attacker's arbitrary payload) and otherwise
// ignored like any other malformed message.
function parseHello(value: unknown): HelloMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const msg = value as Record<string, unknown>;
  if (
    msg.type === "hello" &&
    typeof msg.width === "number" &&
    Number.isFinite(msg.width) &&
    msg.width > 0 &&
    msg.width <= 20000 &&
    typeof msg.height === "number" &&
    Number.isFinite(msg.height) &&
    msg.height > 0 &&
    msg.height <= 20000
  ) {
    return { type: "hello", width: msg.width, height: msg.height };
  }
  return null;
}

interface AttemptMessage {
  type: "move" | "edit" | "delete";
  id: number;
}

// There is no move/edit/delete message type in this app at all (ADR 0004:
// nobody may ever mutate a placed stone) — this exists only to recognise an
// attempt shaped like one, so it can be named in a "refuse" log line with
// the stone's real owner, rather than silently vanishing the same as any
// other unrecognised message type.
function parseAttempt(value: unknown): AttemptMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const msg = value as Record<string, unknown>;
  if (
    (msg.type === "move" || msg.type === "edit" || msg.type === "delete") &&
    typeof msg.id === "number" &&
    Number.isFinite(msg.id)
  ) {
    return { type: msg.type, id: msg.id };
  }
  return null;
}

interface WireStone {
  id: number;
  color: string;
  x: number;
  rotation: number;
  mine: boolean;
}

// Never includes visitorId: the only identity-shaped thing a response ever
// carries is this boolean, computed server-side against the viewer's own
// cookie-resolved id. No cookie id ever appears in a response body.
function toWireStone(stone: Stone, viewerVisitorId: string): WireStone {
  return {
    id: stone.id,
    color: stone.color,
    x: stone.x,
    rotation: stone.rotation,
    mine: stone.visitorId === viewerVisitorId,
  };
}

function readmePage(): string {
  const markdown = readFileSync(README_PATH, "utf8");
  const body = renderMarkdown(markdown);
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>About Cairn</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main class="readme">
${body}
    </main>
  </body>
</html>
`;
}

const server = createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(404).end();
    return;
  }

  const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const decoded = decodeURIComponent(pathname);

  if (decoded === "/") {
    if (serveFile(res, PUBLIC_DIR, "index.html")) return;
    res.writeHead(404).end();
    return;
  }

  if (decoded === "/readme/" || decoded === "/readme") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readmePage());
    return;
  }

  if (decoded.startsWith("/docs/")) {
    if (serveFile(res, DOCS_DIR, decoded.slice("/docs/".length))) return;
    res.writeHead(404).end();
    return;
  }

  if (serveFile(res, PUBLIC_DIR, decoded.slice(1))) return;

  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true });

type ConnectedSocket = WebSocket & { visitorId: string; isNewVisitor: boolean };

// The cookie set here is a response header on the HTTP upgrade request
// itself — the one point in the WebSocket handshake where the server can
// still set a header, before the connection switches protocols. A visitor
// who already sent a valid cookie gets no new Set-Cookie at all.
server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const { visitorId, isNew } = resolveVisitor(req.headers.cookie);
  // `wss` emits "headers" synchronously *inside* handleUpgrade, before its
  // callback runs, so the listener has to be registered beforehand — adding
  // it from inside the callback below is always one tick too late and the
  // cookie silently never gets sent.
  if (isNew) {
    wss.once("headers", (headers: string[]) => {
      headers.push(`Set-Cookie: ${setCookieHeader(visitorId, isSecureRequest(req.headers))}`);
    });
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const connected = ws as ConnectedSocket;
    connected.visitorId = visitorId;
    connected.isNewVisitor = isNew;
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws: ConnectedSocket) => {
  const viewerVisitorId = ws.visitorId;
  const who = publicId(viewerVisitorId);
  // wss.handleUpgrade already added `ws` to wss.clients before emitting
  // "connection" (see ws's own completeUpgrade), so clients.size here already
  // counts this connection — the room size right after this visitor joined,
  // not before.
  logEvent("join", who, `clients_in_room=${wss.clients.size}`);
  // isNew (a cookie freshly minted this connection) is "visit"; an already-
  // held cookie reconnecting is "connect" — the viewport only accompanies a
  // visit, logged once the client's "hello" arrives below.
  if (!ws.isNewVisitor) logEvent("connect", who, "reconnected");

  ws.on("close", () => {
    logEvent("drop", who, "connection closed");
  });

  const snapshot = listStones();
  ws.send(
    JSON.stringify({
      type: "state",
      stones: snapshot.map((stone) => toWireStone(stone, viewerVisitorId)),
      // Purely descriptive, for the page to explain the one-a-day limit
      // before a visitor hits it — the server enforces the limit itself on
      // every drop regardless of what this says.
      placedToday: hasDroppedToday(viewerVisitorId),
    }),
  );
  logEvent("state", who, `sent snapshot of ${snapshot.length} stone(s)`);

  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      logEvent("error", who, "sent unparseable message");
      return;
    }

    const hello = parseHello(parsed);
    if (hello) {
      if (ws.isNewVisitor) {
        logEvent("visit", who, `new visitor, viewport ${hello.width}x${hello.height}`);
      }
      return;
    }

    const attempt = parseAttempt(parsed);
    if (attempt) {
      // No message type here ever does anything (ADR 0004 — nobody may ever
      // move, edit, or delete a placed stone); this only exists so the
      // attempt is named in the log, with the stone's real owner, instead of
      // silently vanishing like any other unrecognised message.
      const target = findStone(attempt.id);
      const owner = target ? publicId(target.visitorId) : "an unknown stone";
      logEvent("refuse", who, `tried to ${attempt.type} stone #${attempt.id} owned by ${owner}`);
      return;
    }

    const drop = parseDrop(parsed);
    if (!drop) {
      logEvent("error", who, `sent an unrecognised or malformed message`);
      return;
    }
    // ADR 0004: one stone per visitor per Canberra day, enforced against the
    // cookie-resolved identity — never a client-claimed one — so a visitor
    // can't bypass the limit by sending a different id in the message.
    if (hasDroppedToday(viewerVisitorId)) {
      logEvent("refuse", who, "tried to place a second stone today");
      return;
    }

    const stone = insertStone(viewerVisitorId, drop.x);
    logEvent("place", who, `stone #${stone.id} at x=${Math.round(stone.x * 1000)}`);
    let recipients = 0;
    for (const client of wss.clients as Set<ConnectedSocket>) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const payload = JSON.stringify({ type: "stone", stone: toWireStone(stone, client.visitorId) });
      client.send(payload);
      recipients++;
    }
    logEvent("broadcast", who, `stone #${stone.id} to ${recipients} client(s)`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  logEvent("boot", null, `cairn listening on 0.0.0.0:${PORT}`);
});
