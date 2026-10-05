import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

// Serves relativePath from baseDir, refusing to escape it (so a crafted
// "../../" in a URL can't read outside public/ or docs/). Returns false
// (writes nothing) when there's no such file, so the caller can 404.
export function serveFile(res: ServerResponse, baseDir: string, relativePath: string): boolean {
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = join(baseDir, safePath);
  if (!fullPath.startsWith(join(baseDir) + "/") && fullPath !== baseDir) return false;
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return false;

  res.writeHead(200, { "Content-Type": MIME[extname(fullPath)] ?? "application/octet-stream" });
  res.end(readFileSync(fullPath));
  return true;
}
