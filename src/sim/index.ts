// STUB written by the lead so the server, client and tests can run before
// sim-dev lands the real simulation. sim-dev replaces this file wholesale,
// keeping these exports and signatures.
import type { FighterState, Input, MatchState, PlayerSetup, Slot } from "./types.ts";
import { MAX_FIGHTERS } from "./types.ts";
import { STAGE } from "./stage.ts";

export * from "./types.ts";
export { STAGE } from "./stage.ts";
export { FIGHTERS } from "./fighters/index.ts";

export function createMatch(players: PlayerSetup[], seed: number, opts: { stocks?: number } = {}): MatchState {
  const fighters: (FighterState | null)[] = Array.from({ length: MAX_FIGHTERS }, () => null);
  for (const p of players) {
    const spawn = STAGE.spawns[p.slot]!;
    fighters[p.slot] = {
      slot: p.slot, fighter: p.fighter, cpu: !!p.cpu, x: spawn.x, y: spawn.y, vx: 0, vy: 0,
      facing: spawn.x < 0 ? 1 : -1, grounded: true, jumpsLeft: 1, fastFalling: false, dropThrough: 0,
      action: "idle", actionFrame: 0, damage: 0, stocks: opts.stocks ?? 3, hitstun: 0, hitstop: 0,
      invuln: 0, shield: 100, respawnIn: 0, hitThisMove: 0, prevButtons: 0, absentSince: null,
      forfeited: false, kos: 0, falls: 0, damageDealt: 0,
    };
  }
  return { tick: 0, phase: "countdown", phaseTick: 0, rng: seed >>> 0, fighters, projectiles: [], nextId: 1, events: [], winner: null };
}

export function step(state: MatchState, inputs: (Input | null | undefined)[]): MatchState {
  const next: MatchState = structuredClone(state);
  next.tick++;
  next.phaseTick++;
  next.events = [];
  if (next.phase === "countdown" && next.phaseTick >= 120) {
    next.phase = "fight";
    next.phaseTick = 0;
    next.events.push({ type: "start" });
  }
  if (next.phase !== "fight") return next;
  for (const f of next.fighters) {
    if (!f) continue;
    const input = inputs[f.slot];
    if (!input) continue;
    f.x += input.x / 25;
    if (input.x !== 0) f.facing = input.x > 0 ? 1 : -1;
    f.action = input.x !== 0 ? "run" : "idle";
  }
  return next;
}

export function cpuInput(_state: MatchState, _slot: Slot): Input {
  return { b: 0, x: 0, y: 0 };
}

export function hashState(state: MatchState): string {
  return JSON.stringify(state);
}
