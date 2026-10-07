// Wire protocol for /ws (contract §5). Everything a client sends is parsed
// here and nowhere else: anything that isn't exactly a known message is null.
import type { FighterId, Input, MatchState, SimEvent, Slot } from "../sim/index.ts";
import { FIGHTER_IDS, GRACE_TICKS } from "../sim/index.ts";

export type ClientMsg =
  | { t: "join"; room?: string }
  | { t: "pick"; fighter: FighterId }
  | { t: "ready"; ready: boolean }
  | { t: "cpu"; add: boolean }
  | { t: "input"; seq: number; b: number; x: number; y: number }
  | { t: "ping"; id: number };

const ROOM_RE = /^[A-Za-z]{4}$/;
const MAX_INT = 2 ** 31;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

export function parseClientMessage(raw: string): ClientMsg | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.t !== "string") return null;
  switch (v.t) {
    case "join":
      if (v.room === undefined) return { t: "join" };
      if (typeof v.room === "string" && ROOM_RE.test(v.room)) return { t: "join", room: v.room.toUpperCase() };
      return null;
    case "pick":
      return typeof v.fighter === "string" && (FIGHTER_IDS as readonly string[]).includes(v.fighter)
        ? { t: "pick", fighter: v.fighter as FighterId }
        : null;
    case "ready":
      return typeof v.ready === "boolean" ? { t: "ready", ready: v.ready } : null;
    case "cpu":
      return typeof v.add === "boolean" ? { t: "cpu", add: v.add } : null;
    case "input":
      return intIn(v.seq, 0, MAX_INT - 1) && intIn(v.b, 0, 15) && intIn(v.x, -100, 100) && intIn(v.y, -100, 100)
        ? { t: "input", seq: v.seq, b: v.b, x: v.x, y: v.y }
        : null;
    case "ping":
      return intIn(v.id, 0, MAX_INT - 1) ? { t: "ping", id: v.id } : null;
    default:
      return null;
  }
}

// ---- server -> client builders (no token ever appears in any of these) ----

const r1 = (n: number): number => Math.round(n * 10) / 10;

export interface SnapFighter {
  slot: Slot;
  fighter: FighterId;
  glyph: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  action: string;
  frame: number;
  damage: number;
  stocks: number;
  invuln: boolean;
  shield: number;
  hitstun: boolean;
  hitstop: boolean;
  inked: boolean;
  absent: boolean;
  graceLeft: number;
  out: boolean;
  cpu: boolean;
}

export const COUNTDOWN_TICKS = 120;

export function buildSnap(state: MatchState, glyphs: readonly string[], events: readonly SimEvent[]): string {
  const fighters: SnapFighter[] = [];
  for (const f of state.fighters) {
    if (!f) continue;
    const absent = f.absentSince !== null && !f.forfeited;
    fighters.push({
      slot: f.slot,
      fighter: f.fighter,
      glyph: glyphs[f.slot] ?? "?",
      x: r1(f.x),
      y: r1(f.y),
      vx: r1(f.vx),
      vy: r1(f.vy),
      facing: f.facing,
      action: f.action,
      frame: f.actionFrame,
      damage: r1(f.damage),
      stocks: f.stocks,
      invuln: f.invuln > 0,
      shield: r1(f.shield),
      hitstun: f.hitstun > 0,
      hitstop: f.hitstop > 0,
      inked: f.inked > 0,
      absent,
      graceLeft: absent ? Math.max(0, GRACE_TICKS - (state.tick - f.absentSince!)) : 0,
      out: f.stocks <= 0,
      cpu: f.cpu,
    });
  }
  return JSON.stringify({
    t: "snap",
    tick: state.tick,
    phase: state.phase,
    countdown: state.phase === "countdown" ? Math.max(0, COUNTDOWN_TICKS - state.phaseTick) : 0,
    fighters,
    items: state.items.map((i) => ({ id: i.id, kind: i.kind, x: r1(i.x), y: r1(i.y) })),
    projectiles: state.projectiles.map((p) => ({ id: p.id, owner: p.owner, x: r1(p.x), y: r1(p.y), r: p.r })),
    events,
  });
}

export interface EndResult {
  slot: Slot;
  glyph: string;
  fighter: FighterId;
  kos: number;
  falls: number;
  damageDealt: number;
  placement: number;
}

export function buildResults(state: MatchState, glyphs: readonly string[]): EndResult[] {
  const fs = state.fighters.filter((f) => f !== null);
  fs.sort((a, b) => {
    if (a.slot === state.winner) return -1;
    if (b.slot === state.winner) return 1;
    return b.stocks - a.stocks || b.kos - a.kos || b.damageDealt - a.damageDealt || a.slot - b.slot;
  });
  return fs.map((f, i) => ({
    slot: f.slot,
    glyph: glyphs[f.slot] ?? "?",
    fighter: f.fighter,
    kos: f.kos,
    falls: f.falls,
    damageDealt: r1(f.damageDealt),
    placement: i + 1,
  }));
}

export const NEUTRAL: Input = { b: 0, x: 0, y: 0 };
