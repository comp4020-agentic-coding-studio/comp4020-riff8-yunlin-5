// The simulation: pure, deterministic, fixed 60 Hz. No Date, no Math.random,
// no I/O. Randomness would come only from state.rng (mulberry32).
import type {
  Action, FighterDef, FighterState, HitboxDef, Input, MatchState, MoveDef, PlayerSetup, ProjectileState, Slot,
} from "./types.ts";
import { BTN, GRACE_TICKS, MAX_FIGHTERS, NO_INPUT } from "./types.ts";
import { STAGE } from "./stage.ts";
import { FIGHTERS } from "./fighters/index.ts";

export * from "./types.ts";
export { STAGE } from "./stage.ts";
export { FIGHTERS } from "./fighters/index.ts";

export const COUNTDOWN_TICKS = 120;
const RESPAWN_DELAY = 90;
const RESPAWN_INVULN = 120;
const DROP_FRAMES = 12;
const DROP_THRESHOLD = 60;
const STRONG_THRESHOLD = 50;
const DEADZONE = 15;
const LAUNCH_SCALE = 0.09; // px/frame of launch speed per unit of knockback
const SHIELD_DRAIN = 0.5;
const SHIELD_REGEN = 0.3;
const SHIELD_BREAK_STUN = 90;
const KO_CREDIT_TICKS = 300;

type Move = "jab" | "strong" | "aerial" | "special";
const MOVE_ACTIONS: readonly Action[] = ["jab", "strong", "aerial", "special"];
const isMove = (a: Action): a is Move => MOVE_ACTIONS.includes(a);

interface Surface { x1: number; x2: number; y: number; solid: boolean }
const SURFACES: Surface[] = [
  { ...STAGE.ground, solid: true },
  ...STAGE.platforms.map((p) => ({ ...p, solid: false })),
];

export function createMatch(players: PlayerSetup[], seed: number, opts: { stocks?: number } = {}): MatchState {
  const fighters: (FighterState | null)[] = Array.from({ length: MAX_FIGHTERS }, () => null);
  for (const p of players) {
    const spawn = STAGE.spawns[p.slot];
    fighters[p.slot] = {
      slot: p.slot, fighter: p.fighter, cpu: !!p.cpu, x: spawn.x, y: spawn.y, vx: 0, vy: 0,
      facing: spawn.x < 0 ? 1 : -1, grounded: true, jumpsLeft: 1, fastFalling: false, dropThrough: 0,
      action: "idle", actionFrame: 0, damage: 0, stocks: opts.stocks ?? 3, hitstun: 0, hitstop: 0,
      invuln: 0, shield: 100, respawnIn: 0, hitThisMove: 0, prevButtons: 0, absentSince: null,
      forfeited: false, prevStickY: 0, lastHitBy: null, lastHitTick: -1, kos: 0, falls: 0, damageDealt: 0,
    };
  }
  return { tick: 0, phase: "countdown", phaseTick: 0, rng: seed >>> 0, fighters, projectiles: [], nextId: 1, events: [], winner: null };
}

// ---------------------------------------------------------------------------

export function knockback(damageAfter: number, hitDamage: number, weight: number, growth: number, base: number): number {
  const p = damageAfter;
  return (((p / 10 + (p * hitDamage) / 20) * (200 / (weight + 100)) * 1.4 + 18) * growth) / 100 + base;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function inGrace(f: FighterState): boolean {
  return f.absentSince !== null && !f.forfeited && f.stocks > 0;
}
/** On the field: has a hurtbox and takes part in physics. */
function onField(f: FighterState | null): f is FighterState {
  return !!f && f.absentSince === null && !f.forfeited && f.action !== "dead";
}

function supportAt(f: FighterState): Surface | undefined {
  return SURFACES.find((s) => s.y === f.y && f.x >= s.x1 && f.x <= s.x2);
}

function startMove(f: FighterState, move: Move): void {
  f.action = move;
  f.actionFrame = 0;
  f.hitThisMove = 0;
}

function endMove(f: FighterState): void {
  f.action = f.grounded ? "idle" : "fall";
  f.actionFrame = 0;
  f.hitThisMove = 0;
}

function respawnFighter(f: FighterState, st: MatchState, event: "respawn" | "back"): void {
  f.x = STAGE.respawn.x;
  f.y = STAGE.respawn.y;
  f.vx = 0;
  f.vy = 0;
  f.grounded = false;
  f.jumpsLeft = 1;
  f.fastFalling = false;
  f.dropThrough = 0;
  f.action = "fall";
  f.actionFrame = 0;
  f.hitstun = 0;
  f.hitstop = 0;
  f.hitThisMove = 0;
  f.invuln = RESPAWN_INVULN;
  f.shield = 100;
  f.respawnIn = 0;
  if (event === "respawn") f.damage = 0;
  if (event === "respawn") st.events.push({ type: "respawn", slot: f.slot, x: f.x, y: f.y });
  else st.events.push({ type: "back", slot: f.slot });
}

function updateAbsence(st: MatchState, inputs: (Input | null | undefined)[], prevTick: number): void {
  for (const f of st.fighters) {
    if (!f || f.forfeited || f.stocks <= 0) continue;
    const input = inputs[f.slot];
    if (input === null) {
      if (f.absentSince === null) {
        f.absentSince = prevTick;
        f.vx = 0;
        st.events.push({ type: "drop", slot: f.slot });
      }
    } else if (f.absentSince !== null) {
      f.absentSince = null;
      respawnFighter(f, st, "back");
      f.prevButtons = (input ?? NO_INPUT).b;
      continue;
    }
    if (f.absentSince !== null && st.tick - f.absentSince >= GRACE_TICKS) {
      f.forfeited = true;
      f.stocks = 0;
      f.action = "dead";
      st.events.push({ type: "forfeit", slot: f.slot });
    }
  }
}

function updateFighter(st: MatchState, f: FighterState, input: Input): void {
  const def = FIGHTERS[f.fighter];
  const pressed = input.b & ~f.prevButtons;
  const downEdge = input.y >= DROP_THRESHOLD && f.prevStickY < DROP_THRESHOLD;
  f.prevButtons = input.b;
  f.prevStickY = input.y;

  if (f.invuln > 0) f.invuln--;
  if (f.dropThrough > 0) f.dropThrough--;

  if (f.hitstop > 0) {
    f.hitstop--;
    return;
  }

  f.actionFrame++;
  const prevY = f.y;
  const prevX = f.x;

  if (f.hitstun > 0) {
    f.hitstun--;
    f.action = "hitstun";
    if (f.hitstun === 0) {
      f.action = f.grounded ? "idle" : "fall";
      f.actionFrame = 0;
    }
  } else if (isMove(f.action)) {
    const move = def.moves[f.action];
    if (f.actionFrame >= move.frames) endMove(f);
  }

  const actionable = f.hitstun === 0 && !isMove(f.action);

  if (actionable) {
    if (pressed & BTN.JUMP) {
      if (f.grounded) {
        f.vy = -def.jumpVel;
        f.grounded = false;
        f.jumpsLeft = 1;
        f.action = "jump";
        f.actionFrame = 0;
        st.events.push({ type: "jump", slot: f.slot });
      } else if (f.jumpsLeft > 0) {
        f.jumpsLeft--;
        f.vy = -def.doubleJumpVel;
        f.fastFalling = false;
        f.action = "jump";
        f.actionFrame = 0;
        st.events.push({ type: "jump", slot: f.slot });
      }
    } else if (pressed & BTN.SPECIAL) {
      startMove(f, "special");
      st.events.push({ type: "special", slot: f.slot });
    } else if (pressed & BTN.ATTACK) {
      if (f.grounded) {
        if (Math.abs(input.x) >= STRONG_THRESHOLD) {
          f.facing = input.x > 0 ? 1 : -1;
          startMove(f, "strong");
        } else startMove(f, "jab");
      } else startMove(f, "aerial");
    } else if (f.grounded && downEdge && f.y !== STAGE.ground.y && f.action !== "shield") {
      f.dropThrough = DROP_FRAMES;
      f.grounded = false;
      f.action = "fall";
      f.actionFrame = 0;
    }
  }

  const acting = f.hitstun === 0 && !isMove(f.action);
  // shield
  if (acting && f.grounded && f.action !== "jump" && (input.b & BTN.SHIELD) && f.shield > 0) {
    if (f.action !== "shield") {
      f.action = "shield";
      f.actionFrame = 0;
    }
    f.shield = Math.max(0, f.shield - SHIELD_DRAIN);
    f.vx = 0;
    if (f.shield <= 0) breakShield(f);
  } else {
    if (f.action === "shield") {
      f.action = "idle";
      f.actionFrame = 0;
    }
    if (f.hitstun === 0) f.shield = Math.min(100, f.shield + SHIELD_REGEN);
  }

  // horizontal control
  const free = f.hitstun === 0 && !isMove(f.action) && f.action !== "shield";
  const stickX = Math.abs(input.x) < DEADZONE ? 0 : input.x / 100;
  if (free) {
    if (stickX !== 0) f.facing = stickX > 0 ? 1 : -1;
    if (f.grounded) {
      f.vx = stickX * def.walkSpeed;
      f.action = stickX !== 0 ? "run" : "idle";
    } else {
      f.vx += (stickX * def.airSpeed - f.vx) * 0.2;
      if (f.action === "run" || f.action === "idle" || (f.action === "jump" && f.vy > 0)) f.action = "fall";
      if (input.y >= DROP_THRESHOLD && f.vy > 0 && !f.fastFalling) f.fastFalling = true;
    }
  } else if (f.hitstun > 0) {
    f.vx *= f.grounded ? 0.9 : 0.998;
  } else if (isMove(f.action)) {
    f.vx *= f.grounded ? 0.8 : 0.98;
    const mv: MoveDef = def.moves[f.action];
    if (mv.impulse && mv.impulse.frame === f.actionFrame) {
      f.vx = mv.impulse.vx * f.facing;
      if (mv.impulse.vy !== 0) {
        f.vy = mv.impulse.vy;
        if (f.vy < 0) f.grounded = false;
      }
    }
    if (mv.projectile && mv.projectile.frame === f.actionFrame) {
      const pd = mv.projectile;
      st.projectiles.push({
        id: st.nextId++, owner: f.slot, x: f.x + f.facing * pd.x, y: f.y + pd.y, vx: pd.vx * f.facing, vy: pd.vy,
        gravity: pd.gravity, life: pd.life, r: pd.r, damage: pd.damage, base: pd.base, growth: pd.growth,
        angle: pd.angle, dir: f.facing,
      });
    }
  } else if (f.action === "shield") f.vx = 0;

  // vertical
  if (!f.grounded) {
    f.vy += def.gravity;
    const cap = f.hitstun > 0 ? 30 : f.fastFalling ? def.fastFall : def.maxFall;
    if (f.vy > cap) f.vy = cap;
  }
  f.x += f.vx;
  f.y += f.vy;
  if (f.grounded) {
    f.y = prevY;
    if (!supportAt(f)) f.grounded = false;
  }

  if (!f.grounded) collide(f, prevX, prevY, def);

  if (f.grounded && f.action === "aerial") endMove(f);
}

function breakShield(f: FighterState): void {
  f.shield = 0;
  f.hitstun = SHIELD_BREAK_STUN;
  f.action = "hitstun";
  f.actionFrame = 0;
}

function collide(f: FighterState, prevX: number, prevY: number, _def: FighterDef): void {
  // side wall of the solid ground block: it extends below its top surface.
  const g = STAGE.ground;
  if (f.y > g.y && f.x > g.x1 && f.x < g.x2) {
    f.x = prevX <= g.x1 || (prevX < g.x2 && prevX - g.x1 < g.x2 - prevX) ? g.x1 : g.x2;
    f.vx = 0;
  }
  if (f.vy < 0) return;
  let best: Surface | null = null;
  for (const s of SURFACES) {
    if (f.x < s.x1 || f.x > s.x2) continue;
    if (!s.solid && f.dropThrough > 0) continue;
    if (prevY <= s.y && f.y >= s.y && (!best || s.y < best.y)) best = s;
  }
  if (best) {
    f.y = best.y;
    f.vy = 0;
    f.grounded = true;
    f.jumpsLeft = 1;
    f.fastFalling = false;
    if (f.hitstun === 0 && f.action !== "shield" && !isMove(f.action)) f.action = "idle";
  }
}

// ---------------------------------------------------------------------------

function circleHitsFighter(cx: number, cy: number, r: number, t: FighterState): boolean {
  const def = FIGHTERS[t.fighter];
  const left = t.x - def.width / 2;
  const right = t.x + def.width / 2;
  const top = t.y - def.height;
  const nx = clamp(cx, left, right);
  const ny = clamp(cy, top, t.y);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

interface Strike {
  attacker: Slot;
  target: FighterState;
  damage: number;
  base: number;
  growth: number;
  angle: number;
  dir: 1 | -1;
  x: number;
  y: number;
  projectileId: number | null;
}

function applyStrikes(st: MatchState, strikes: Strike[]): void {
  for (const s of strikes) {
    const t = s.target;
    const attacker = st.fighters[s.attacker]!;
    const stopFrames = Math.floor(4 + s.damage / 3);
    if (t.action === "shield" && t.hitstun === 0) {
      t.shield -= s.damage * 2;
      t.vx += s.dir * 1.5;
      st.events.push({ type: "hit", attacker: s.attacker, target: t.slot, damage: 0, kb: 0, x: s.x, y: s.y, shielded: true });
      attacker.hitstop = Math.max(attacker.hitstop, Math.floor(stopFrames / 2));
      if (t.shield <= 0) breakShield(t);
      continue;
    }
    const tdef = FIGHTERS[t.fighter];
    t.damage += s.damage;
    attacker.damageDealt += s.damage;
    const kb = knockback(t.damage, s.damage, tdef.weight, s.growth, s.base);
    const speed = kb * LAUNCH_SCALE;
    const a = rad(s.angle);
    t.vx = Math.cos(a) * speed * s.dir;
    t.vy = -Math.sin(a) * speed;
    if (t.vy < 0) t.grounded = false;
    t.hitstun = Math.max(1, Math.floor(kb * 0.4));
    t.action = "hitstun";
    t.actionFrame = 0;
    t.fastFalling = false;
    t.hitThisMove = 0;
    t.hitstop = Math.max(t.hitstop, stopFrames);
    t.lastHitBy = s.attacker;
    t.lastHitTick = st.tick;
    if (s.projectileId === null) attacker.hitstop = Math.max(attacker.hitstop, stopFrames);
    st.events.push({ type: "hit", attacker: s.attacker, target: t.slot, damage: s.damage, kb, x: s.x, y: s.y, shielded: false });
  }
}

function resolveHits(st: MatchState): void {
  const strikes: Strike[] = [];
  const struck = new Set<string>();
  for (const a of st.fighters) {
    if (!onField(a) || a.hitstop > 0 || a.hitstun > 0 || !isMove(a.action)) continue;
    const move = FIGHTERS[a.fighter].moves[a.action];
    for (const hb of move.hitboxes) {
      if (a.actionFrame < hb.start || a.actionFrame > hb.end) continue;
      const cx = a.x + a.facing * hb.x;
      const cy = a.y + hb.y;
      for (const t of st.fighters) {
        if (!t || t === a || !onField(t) || t.invuln > 0) continue;
        if (a.hitThisMove & (1 << t.slot)) continue;
        const key = `${a.slot}:${t.slot}`;
        if (struck.has(key)) continue;
        if (!circleHitsFighter(cx, cy, hb.r, t)) continue;
        struck.add(key);
        strikes.push(strikeFrom(a.slot, t, hb, a.facing, cx, cy));
      }
    }
  }
  for (const s of strikes) st.fighters[s.attacker]!.hitThisMove |= 1 << s.target.slot;
  // projectiles
  const alive: ProjectileState[] = [];
  for (const p of st.projectiles) {
    let hit = false;
    for (const t of st.fighters) {
      if (!t || t.slot === p.owner || !onField(t) || t.invuln > 0) continue;
      if (!circleHitsFighter(p.x, p.y, p.r, t)) continue;
      strikes.push({
        attacker: p.owner, target: t, damage: p.damage, base: p.base, growth: p.growth, angle: p.angle,
        dir: p.dir, x: p.x, y: p.y, projectileId: p.id,
      });
      hit = true;
      break;
    }
    if (!hit) alive.push(p);
  }
  st.projectiles = alive;
  applyStrikes(st, strikes);
}

function strikeFrom(attacker: Slot, target: FighterState, hb: HitboxDef, dir: 1 | -1, x: number, y: number): Strike {
  return { attacker, target, damage: hb.damage, base: hb.base, growth: hb.growth, angle: hb.angle, dir, x, y, projectileId: null };
}

function stepProjectiles(st: MatchState): void {
  const B = STAGE.blast;
  st.projectiles = st.projectiles.filter((p) => {
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    return p.life > 0 && p.x > B.left && p.x < B.right && p.y > B.top && p.y < B.bottom;
  });
}

function checkKOs(st: MatchState): void {
  const B = STAGE.blast;
  for (const f of st.fighters) {
    if (!onField(f)) continue;
    const cy = f.y - FIGHTERS[f.fighter].height / 2;
    if (f.x >= B.left && f.x <= B.right && cy >= B.top && cy <= B.bottom) continue;
    const by = f.lastHitBy !== null && st.tick - f.lastHitTick <= KO_CREDIT_TICKS ? f.lastHitBy : null;
    f.stocks--;
    f.falls++;
    f.action = "dead";
    f.actionFrame = 0;
    f.respawnIn = RESPAWN_DELAY;
    f.vx = f.vy = 0;
    f.hitstun = f.hitstop = 0;
    f.hitThisMove = 0;
    f.lastHitBy = null;
    st.events.push({ type: "ko", slot: f.slot, x: f.x, y: f.y, by });
    if (by !== null) st.fighters[by]!.kos++;
  }
}

function tickRespawns(st: MatchState): void {
  for (const f of st.fighters) {
    if (!f || f.action !== "dead" || f.stocks <= 0 || f.forfeited || f.absentSince !== null) continue;
    if (--f.respawnIn <= 0) {
      respawnFighter(f, st, "respawn");
      f.respawnIn = 0;
    }
  }
}

function checkWin(st: MatchState): void {
  const present = st.fighters.filter((f): f is FighterState => !!f);
  const alive = present.filter((f) => f.stocks > 0 && !f.forfeited);
  if (alive.length <= 1 && !present.some(inGrace)) {
    st.phase = "ended";
    st.phaseTick = 0;
    st.winner = alive.length === 1 ? alive[0].slot : null;
    st.events.push({ type: "end", winner: st.winner });
  }
}

export function step(state: MatchState, inputs: (Input | null | undefined)[]): MatchState {
  const st: MatchState = structuredClone(state);
  const prevTick = state.tick;
  st.tick++;
  st.phaseTick++;
  st.events = [];
  if (st.phase === "ended") return st;

  updateAbsence(st, inputs, prevTick);

  if (st.phase === "countdown") {
    if (st.phaseTick >= COUNTDOWN_TICKS) {
      st.phase = "fight";
      st.phaseTick = 0;
      st.events.push({ type: "start" });
    }
    return st;
  }

  for (const f of st.fighters) {
    if (!onField(f)) continue;
    updateFighter(st, f, inputs[f.slot] ?? NO_INPUT);
  }
  tickRespawns(st);
  stepProjectiles(st);
  resolveHits(st);
  checkKOs(st);
  checkWin(st);
  return st;
}

// ---------------------------------------------------------------------------

const mix = (a: number, b: number) => (Math.imul(a ^ (a >>> 15), 2246822507) ^ Math.imul(b + 0x9e3779b9, 3266489909)) >>> 0;

/** Deterministic pseudo-randomness from the tick and slot, never from state.rng. */
function noise(state: MatchState, slot: Slot, salt: number): number {
  return mix(mix(state.tick, slot + 1), salt) % 1000;
}

export function cpuInput(state: MatchState, slot: Slot): Input {
  const me = state.fighters[slot];
  if (!me || !onField(me) || state.phase !== "fight") return { ...NO_INPUT };
  const def = FIGHTERS[me.fighter];
  const canPress = (bit: number) => (me.prevButtons & bit) === 0;
  const g = STAGE.ground;

  // recovery
  const offStage = !me.grounded && (me.y > g.y - 4 && (me.x < g.x1 + 20 || me.x > g.x2 - 20 || me.y > g.y + 1));
  if (me.hitstun > 0) return { ...NO_INPUT };
  if (offStage && !isMove(me.action)) {
    const toward = me.x > 0 ? -100 : 100;
    let b = 0;
    const jumpsAvail = me.jumpsLeft > 0;
    if (jumpsAvail && me.vy > 0 && canPress(BTN.JUMP)) b |= BTN.JUMP;
    return { b, x: toward, y: 0 };
  }

  let target: FighterState | null = null;
  let best = Infinity;
  for (const o of state.fighters) {
    if (!o || o === me || !onField(o)) continue;
    const d = Math.abs(o.x - me.x) + Math.abs(o.y - me.y);
    if (d < best) { best = d; target = o; }
  }
  if (!target) return { ...NO_INPUT };
  const dx = target.x - me.x;
  const dy = target.y - me.y;
  const dir = dx >= 0 ? 100 : -100;
  const n = noise(state, slot, 1);

  // shield against an incoming attack sometimes
  if (me.grounded && isMove(target.action) && Math.abs(dx) < 110 && Math.abs(dy) < 80 && n < 450 && me.shield > 20) {
    return { b: BTN.SHIELD, x: 0, y: 0 };
  }
  if (me.action === "shield" && n < 700 && me.shield > 10) return { b: BTN.SHIELD, x: 0, y: 0 };

  const reach = 75 + def.width / 2;
  if (Math.abs(dx) < reach && Math.abs(dy) < 70) {
    if (me.grounded) {
      if (canPress(BTN.ATTACK) && n < 250) return { b: BTN.ATTACK, x: n < 100 ? dir : 0, y: 0 };
      return { b: 0, x: dx >= 0 ? 20 : -20, y: 0 };
    }
    if (canPress(BTN.ATTACK) && n < 300) return { b: BTN.ATTACK, x: dir / 2, y: 0 };
    return { b: 0, x: dir / 2, y: 0 };
  }
  // ranged
  if (Math.abs(dx) > 160 && Math.abs(dx) < 420 && Math.abs(dy) < 60 && canPress(BTN.SPECIAL) && n % 40 === 0) {
    return { b: BTN.SPECIAL, x: dir, y: 0 };
  }
  // chase upwards
  if (dy < -70 && canPress(BTN.JUMP) && n < 120 && (me.grounded || me.jumpsLeft > 0) && Math.abs(dx) < 260) {
    return { b: BTN.JUMP, x: dir, y: 0 };
  }
  return { b: 0, x: dir, y: 0 };
}

// ---------------------------------------------------------------------------

/** 53-bit string hash of the whole state (cyrb53). */
export function hashState(state: MatchState): string {
  const s = JSON.stringify(state);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
