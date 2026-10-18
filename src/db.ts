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
  canberra_date: string;
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

// ADR 0004: one stone per visitor per Canberra calendar day. A database
// created before this decision won't have the column yet, so it's added
// here rather than assumed — existing rows are backfilled from their
// created_at so the limit applies to history too, not just new rows.
const hasCanberraDate = (db.prepare("PRAGMA table_info(stones)").all() as unknown as { name: string }[]).some(
  (col) => col.name === "canberra_date",
);
if (!hasCanberraDate) {
  db.exec("ALTER TABLE stones ADD COLUMN canberra_date TEXT NOT NULL DEFAULT ''");
  const backfill = db.prepare("SELECT id, created_at FROM stones WHERE canberra_date = ''") as unknown as {
    all(): { id: number; created_at: string }[];
  };
  const updateDate = db.prepare("UPDATE stones SET canberra_date = ? WHERE id = ?");
  for (const row of backfill.all()) {
    updateDate.run(canberraDate(new Date(row.created_at)), row.id);
  }
}

const insertStmt = db.prepare(
  "INSERT INTO stones (visitor_id, color, x, rotation, created_at, canberra_date) VALUES (?, ?, ?, ?, ?, ?)",
);
const listStmt = db.prepare(
  "SELECT id, visitor_id, color, x, rotation, created_at, canberra_date FROM stones ORDER BY id ASC",
);
const countTodayStmt = db.prepare(
  "SELECT COUNT(*) AS n FROM stones WHERE visitor_id = ? AND canberra_date = ?",
);

// The brief and the crit run on Canberra's clock, so that's the day boundary
// for the one-stone-a-day limit (ADR 0004) — not UTC, not the visitor's own
// timezone, which the server has no trustworthy way to know anyway.
export function canberraDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Canberra" }).format(date);
}

export function hasDroppedToday(visitorId: string): boolean {
  const today = canberraDate(new Date());
  const row = countTodayStmt.get(visitorId, today) as unknown as { n: number };
  return row.n > 0;
}

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
  const now = new Date();
  const createdAt = now.toISOString();
  const result = insertStmt.run(visitorId, color, x, rotation, createdAt, canberraDate(now));
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
