import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// The file keeps its old name, colophon.db: it is the one already on the Fly volume, and
// renaming it would orphan it.
// /data is the one thing that survives a restart or redeploy (fly.toml mounts
// a volume there). Locally and in CI it exists too; only a bare local checkout
// falls back to a repo-relative path.
const DB_PATH = process.env.DB_PATH ?? (existsSync("/data") ? "/data/colophon.db" : "./data/colophon.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// The Colophon table is gone: its rows carried seal tokens.
db.exec("DROP TABLE IF EXISTS colophons");

// Match history: glyphs and fighter ids only, never a seal token.
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finished_at INTEGER NOT NULL,
    duration_ticks INTEGER NOT NULL,
    winner_glyph TEXT,
    winner_fighter TEXT,
    players_json TEXT NOT NULL
  )
`);

// Added after the first release: migrate a database that predates it.
if (!(db.prepare("PRAGMA table_info(matches)").all() as { name: string }[]).some((c) => c.name === "stage")) {
  db.exec("ALTER TABLE matches ADD COLUMN stage TEXT");
}

export interface MatchPlayer {
  glyph: string;
  fighter: string;
  kos: number;
  falls: number;
  placement: number;
}

export interface MatchRecord {
  id: number;
  finishedAt: number;
  durationTicks: number;
  winnerGlyph: string | null;
  winnerFighter: string | null;
  stage: string | null;
  players: MatchPlayer[];
}

const insert = db.prepare(
  "INSERT INTO matches (finished_at, duration_ticks, winner_glyph, winner_fighter, players_json, stage) VALUES (?, ?, ?, ?, ?, ?)",
);
const prune = db.prepare("DELETE FROM matches WHERE id <= (SELECT MAX(id) FROM matches) - 1000");
const selectRecent = db.prepare("SELECT * FROM matches ORDER BY id DESC LIMIT ?");

export function recordMatch(
  durationTicks: number,
  winner: { glyph: string; fighter: string } | null,
  players: MatchPlayer[],
  stage: string | null = null,
): void {
  insert.run(Date.now(), durationTicks, winner?.glyph ?? null, winner?.fighter ?? null, JSON.stringify(players), stage);
  prune.run();
}

export function recentMatches(limit: number): MatchRecord[] {
  const rows = selectRecent.all(Math.max(0, Math.min(100, Math.floor(limit)))) as Record<string, unknown>[];
  return rows.map((r) => {
    let players: MatchPlayer[] = [];
    try {
      players = JSON.parse(String(r.players_json)) as MatchPlayer[];
    } catch {
      // a corrupt row renders as a match with no listed players
    }
    return {
      id: Number(r.id),
      finishedAt: Number(r.finished_at),
      durationTicks: Number(r.duration_ticks),
      winnerGlyph: r.winner_glyph === null ? null : String(r.winner_glyph),
      winnerFighter: r.winner_fighter === null ? null : String(r.winner_fighter),
      stage: r.stage === null || r.stage === undefined ? null : String(r.stage),
      players,
    };
  });
}
