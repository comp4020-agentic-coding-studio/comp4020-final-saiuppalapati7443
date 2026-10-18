import { createServer, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { hasDroppedToday, insertStone, listStones, type Stone } from "./db.ts";
import { renderMarkdown } from "./readme.ts";
import { serveFile } from "./static.ts";
import { isSecureRequest, resolveVisitor, setCookieHeader } from "./identity.ts";

const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const DOCS_DIR = fileURLToPath(new URL("../docs", import.meta.url));
const README_PATH = fileURLToPath(new URL("../README.md", import.meta.url));

interface DropMessage {
  type: "drop";
  x: number;
}

// Anything arriving over the socket is untrusted: unparseable JSON, the
// wrong shape, or an x outside [0, 1] is dropped here and never reaches
// node:sqlite or another client. ADR 0004: identity is never read from the
// message body — a `visitorId`, `name`, `mine`, or `id` field here is simply
// never looked at, forged or not, so there's nothing to validate it against.
function parseDrop(data: string): DropMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
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

// ADR 0004: a visitor who shows up with no cookie, or a tampered/forged one
// (not a UUID the server itself minted), gets a brand-new identity set here
// — never a repaired or reused one. That's the only place a visitor's cookie
// is ever set.
function ensureVisitorCookie(req: IncomingMessage, res: { setHeader(name: string, value: string): void }): string {
  const { visitorId, isNew } = resolveVisitor(req.headers.cookie);
  if (isNew) {
    res.setHeader("Set-Cookie", setCookieHeader(visitorId, isSecureRequest(req.headers)));
  }
  return visitorId;
}

const server = createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(404).end();
    return;
  }

  ensureVisitorCookie(req, res);

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
    (ws as WebSocket & { visitorId: string }).visitorId = visitorId;
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws: WebSocket & { visitorId: string }) => {
  const viewerVisitorId = ws.visitorId;
  ws.send(
    JSON.stringify({
      type: "state",
      stones: listStones().map((stone) => toWireStone(stone, viewerVisitorId)),
    }),
  );

  ws.on("message", (data) => {
    const message = parseDrop(data.toString());
    if (!message) return;
    // ADR 0004: one stone per visitor per Canberra day, enforced against the
    // cookie-resolved identity — never a client-claimed one — so a visitor
    // can't bypass the limit by sending a different id in the message.
    if (hasDroppedToday(viewerVisitorId)) return;

    const stone = insertStone(viewerVisitorId, message.x);
    for (const client of wss.clients as Set<WebSocket & { visitorId: string }>) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const payload = JSON.stringify({ type: "stone", stone: toWireStone(stone, client.visitorId) });
      client.send(payload);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`cairn listening on 0.0.0.0:${PORT}`);
});
