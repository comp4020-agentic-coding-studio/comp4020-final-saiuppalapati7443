import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { insertStone, listStones, type Stone } from "./db.ts";
import { renderMarkdown } from "./readme.ts";
import { serveFile } from "./static.ts";

const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const DOCS_DIR = fileURLToPath(new URL("../docs", import.meta.url));
const README_PATH = fileURLToPath(new URL("../README.md", import.meta.url));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DropMessage {
  type: "drop";
  visitorId: string;
  x: number;
}

// Anything arriving over the socket is untrusted: unparseable JSON, the
// wrong shape, a visitorId that isn't a UUID, or an x outside [0, 1] is
// dropped here and never reaches node:sqlite or another client.
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
    typeof msg.visitorId === "string" &&
    UUID_RE.test(msg.visitorId) &&
    typeof msg.x === "number" &&
    Number.isFinite(msg.x) &&
    msg.x >= 0 &&
    msg.x <= 1
  ) {
    return { type: "drop", visitorId: msg.visitorId, x: msg.x };
  }
  return null;
}

function toWireStone(stone: Stone): Pick<Stone, "id" | "color" | "x" | "rotation"> {
  return { id: stone.id, color: stone.color, x: stone.x, rotation: stone.rotation };
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

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "state", stones: listStones().map(toWireStone) }));

  ws.on("message", (data) => {
    const message = parseDrop(data.toString());
    if (!message) return;

    const stone = insertStone(message.visitorId, message.x);
    const payload = JSON.stringify({ type: "stone", stone: toWireStone(stone) });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`cairn listening on 0.0.0.0:${PORT}`);
});
