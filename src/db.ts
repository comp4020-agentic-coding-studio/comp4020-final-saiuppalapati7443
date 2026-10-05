import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Stone {
  id: number;
  visitorId: string;
  color: string;
  x: number;
  rotation: number;
  createdAt: string;
}

interface StoneRow {
  id: number;
  visitor_id: string;
  color: string;
  x: number;
  rotation: number;
  created_at: string;
}

// Set only in the Dockerfile (to the mounted /data volume); local dev falls
// back to a gitignored directory so it never needs a root-owned /data.
const dataDir = process.env.DATA_DIR ?? "./.data";
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "cairn.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS stones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    color TEXT NOT NULL,
    x REAL NOT NULL,
    rotation REAL NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const insertStmt = db.prepare(
  "INSERT INTO stones (visitor_id, color, x, rotation, created_at) VALUES (?, ?, ?, ?, ?)",
);
const listStmt = db.prepare(
  "SELECT id, visitor_id, color, x, rotation, created_at FROM stones ORDER BY id ASC",
);

// A visitor's color is a hash of their id, not a stored account — the same id
// always lands the same hue, and nothing here identifies a person further.
export function colorFor(visitorId: string): string {
  let hash = 0;
  for (let i = 0; i < visitorId.length; i++) {
    hash = (hash * 31 + visitorId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

export function insertStone(visitorId: string, x: number): Stone {
  const color = colorFor(visitorId);
  const rotation = Math.random() * 16 - 8;
  const createdAt = new Date().toISOString();
  const result = insertStmt.run(visitorId, color, x, rotation, createdAt);
  return {
    id: Number(result.lastInsertRowid),
    visitorId,
    color,
    x,
    rotation,
    createdAt,
  };
}

export function listStones(): Stone[] {
  const rows = listStmt.all() as unknown as StoneRow[];
  return rows.map((row) => ({
    id: row.id,
    visitorId: row.visitor_id,
    color: row.color,
    x: row.x,
    rotation: row.rotation,
    createdAt: row.created_at,
  }));
}
