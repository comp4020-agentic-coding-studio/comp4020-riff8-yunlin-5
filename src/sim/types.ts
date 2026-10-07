// The shared contract between the sim, the server and the tests. The client
// never imports this (it's plain JS with no build step); the wire shapes it
// reads are in src/net/protocol.ts, built from these.

export type FighterId = "brush" | "carver" | "blot" | "wanderer";
export const FIGHTER_IDS: readonly FighterId[] = ["brush", "carver", "blot", "wanderer"];

export type Slot = 0 | 1 | 2 | 3;
export const MAX_FIGHTERS = 4;

// One tick's input for one fighter. `b` is a bitmask of BTN; `x`/`y` are the
// stick, integers in [-100, 100], y positive = down (canvas convention).
export interface Input {
  b: number;
  x: number;
  y: number;
}
export const BTN = { JUMP: 1, ATTACK: 2, SPECIAL: 4, SHIELD: 8 } as const;
// step() takes inputs indexed by slot; null means that player is disconnected.
export const GRACE_TICKS = 900; // 15 s at 60 Hz
export const NO_INPUT: Input = { b: 0, x: 0, y: 0 };

// World units are logical pixels; y grows downward; the main stage's top
// surface is y = 0 and the stage is centred on x = 0.
export interface Surface {
  x1: number;
  x2: number;
  y: number;
}
export interface StageDef {
  ground: Surface; // solid: can't be dropped through, can't be passed from below
  platforms: Surface[]; // pass-through: land from above, drop with stick down
  blast: { left: number; right: number; top: number; bottom: number };
  spawns: { x: number; y: number }[]; // one per slot
  respawn: { x: number; y: number }; // above the stage, ledge-safe
}

export interface HitboxDef {
  start: number; // first active frame of the move (inclusive)
  end: number; // last active frame (inclusive)
  x: number; // centre, forward-relative (multiplied by facing)
  y: number; // centre, relative to the feet (negative is up)
  r: number; // radius
  damage: number;
  base: number; // base knockback, b
  growth: number; // knockback growth, s (around 100)
  angle: number; // launch angle in degrees: 0 forward, 90 straight up
}

export interface ProjectileDef {
  frame: number; // move frame on which it spawns
  x: number;
  y: number; // spawn offset, like a hitbox
  vx: number; // forward-relative
  vy: number;
  gravity: number;
  life: number; // frames
  r: number;
  damage: number;
  base: number;
  growth: number;
  angle: number;
}

export interface MoveDef {
  frames: number; // total duration; the fighter is committed until it ends
  hitboxes: HitboxDef[];
  projectile?: ProjectileDef;
  impulse?: { frame: number; vx: number; vy: number }; // forward-relative, applied once
}

export interface FighterDef {
  id: FighterId;
  name: string;
  weight: number; // around 100; heavier launches less
  walkSpeed: number; // px per frame
  airSpeed: number;
  jumpVel: number; // positive number; applied upward
  doubleJumpVel: number;
  gravity: number; // px per frame per frame
  maxFall: number;
  fastFall: number;
  width: number; // hurtbox: axis-aligned rect centred on x, from y - height to y
  height: number;
  moves: { jab: MoveDef; strong: MoveDef; aerial: MoveDef; special: MoveDef };
}

export type Action =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "jab"
  | "strong"
  | "aerial"
  | "special"
  | "shield"
  | "hitstun"
  | "dead";

export interface FighterState {
  slot: Slot;
  fighter: FighterId;
  cpu: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  jumpsLeft: number; // double jump counter
  fastFalling: boolean;
  dropThrough: number; // frames left ignoring pass-through platforms
  action: Action;
  actionFrame: number; // frames since the action began
  damage: number; // percent
  stocks: number;
  hitstun: number; // frames
  hitstop: number; // frames frozen after a hit (attacker and defender)
  invuln: number; // frames, after respawn
  shield: number; // 0..100
  respawnIn: number; // frames until respawn while action === "dead"
  hitThisMove: number; // bitmask of slots already hit by the current move
  prevButtons: number; // for edge detection
  absentSince: number | null; // tick its player dropped; null while present (docs/decisions/0001)
  forfeited: boolean; // grace ran out: out of the match, stocks 0
  prevStickY: number; // for edge detection of drop-through
  lastHitBy: Slot | null; // for KO credit
  lastHitTick: number;
  // match stats
  kos: number;
  falls: number;
  damageDealt: number;
}

export interface ProjectileState {
  id: number;
  owner: Slot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  r: number;
  damage: number;
  base: number;
  growth: number;
  angle: number; // already resolved to world direction: launch facing baked in via `dir`
  dir: 1 | -1;
}

export type SimEvent =
  | { type: "hit"; attacker: Slot; target: Slot; damage: number; kb: number; x: number; y: number; shielded: boolean }
  | { type: "ko"; slot: Slot; x: number; y: number; by: Slot | null }
  | { type: "respawn"; slot: Slot; x: number; y: number }
  | { type: "special"; slot: Slot }
  | { type: "jump"; slot: Slot }
  | { type: "drop"; slot: Slot }
  | { type: "back"; slot: Slot }
  | { type: "forfeit"; slot: Slot }
  | { type: "start" }
  | { type: "end"; winner: Slot | null };

export type Phase = "countdown" | "fight" | "ended";

export interface MatchState {
  tick: number;
  phase: Phase;
  phaseTick: number;
  rng: number; // uint32 PRNG state (mulberry32 or similar), the only randomness
  fighters: (FighterState | null)[]; // length MAX_FIGHTERS, indexed by slot
  projectiles: ProjectileState[];
  nextId: number;
  events: SimEvent[]; // emitted by the most recent step only
  winner: Slot | null;
}

export interface PlayerSetup {
  slot: Slot;
  fighter: FighterId;
  cpu?: boolean;
}
