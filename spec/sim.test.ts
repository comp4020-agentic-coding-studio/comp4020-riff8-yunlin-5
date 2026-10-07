import { describe, expect, it } from "vitest";
import {
  BTN, FIGHTERS, GRACE_TICKS, INK_FRAMES, ITEM_INTERVAL, ITEM_JITTER, NO_INPUT, STAGE, cpuInput, createMatch, hashState, knockback, step,
} from "../src/sim/index.ts";
import type { Input, MatchState } from "../src/sim/index.ts";

const IN = (b = 0, x = 0, y = 0): Input => ({ b, x, y });

function fight(n = 2, stocks = 3): MatchState {
  let s = createMatch(
    Array.from({ length: n }, (_, i) => ({ slot: i as 0 | 1 | 2 | 3, fighter: "wanderer" as const })),
    7,
    { stocks },
  );
  while (s.phase === "countdown") s = step(s, []);
  return s;
}
function run(s: MatchState, n: number, inputs: (Input | null | undefined)[] = []): MatchState {
  for (let i = 0; i < n; i++) s = step(s, inputs);
  return s;
}
function edit(s: MatchState, slot: number, patch: Partial<MatchState["fighters"][number] & object>): MatchState {
  const c = structuredClone(s);
  Object.assign(c.fighters[slot]!, patch);
  return c;
}
const f = (s: MatchState, slot: number) => s.fighters[slot]!;
const has = (s: MatchState, type: string) => s.events.some((e) => e.type === type);

describe("flow", () => {
  it("counts down for 120 ticks, then fights", () => {
    let s = createMatch([{ slot: 0, fighter: "brush" }, { slot: 1, fighter: "blot" }], 1);
    s = run(s, 119);
    expect(s.phase).toBe("countdown");
    s = step(s, []);
    expect(s.phase).toBe("fight");
    expect(has(s, "start")).toBe(true);
  });
  it("does not mutate its input", () => {
    const s = fight();
    const before = JSON.stringify(s);
    step(s, [IN(BTN.JUMP, 100), IN(BTN.ATTACK)]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("knockback", () => {
  it("rises with damage", () => {
    const w = FIGHTERS.wanderer.weight;
    let last = -1;
    for (const p of [5, 30, 60, 100, 150]) {
      const kb = knockback(p, 12, w, 100, 30);
      expect(kb).toBeGreaterThan(last);
      last = kb;
    }
  });
  it("is smaller against heavier fighters", () => {
    expect(knockback(80, 12, 130, 100, 30)).toBeLessThan(knockback(80, 12, 80, 100, 30));
  });
  it("a hit applies damage and launch", () => {
    let s = fight();
    s = edit(s, 0, { x: 0, facing: 1 });
    s = edit(s, 1, { x: 30, facing: -1 });
    s = step(s, [IN(BTN.ATTACK, 100), NO_INPUT]);
    s = run(s, 14, [NO_INPUT, NO_INPUT]);
    expect(f(s, 1).damage).toBe(FIGHTERS.wanderer.moves.strong.hitboxes[0].damage);
    expect(f(s, 1).vx).toBeGreaterThan(0);
    expect(f(s, 0).damageDealt).toBeGreaterThan(0);
  });
  it("jab at 0% does not KO", () => {
    let s = fight();
    s = edit(s, 0, { x: 280, facing: 1 });
    s = edit(s, 1, { x: 310, facing: -1 });
    s = step(s, [IN(BTN.ATTACK), NO_INPUT]);
    s = run(s, 200, [NO_INPUT, IN(0, -100)]);
    expect(f(s, 1).stocks).toBe(3);
  });
  it("a strong hit launches a damaged fighter off the edge past the blast zone", () => {
    let s = fight();
    s = edit(s, 0, { x: 280, facing: 1 });
    s = edit(s, 1, { x: 310, facing: -1, damage: 110 });
    s = step(s, [IN(BTN.ATTACK, 100), NO_INPUT]);
    let ko = false;
    for (let i = 0; i < 200 && !ko; i++) {
      s = step(s, [NO_INPUT, NO_INPUT]);
      ko = has(s, "ko");
    }
    expect(ko).toBe(true);
  });
});

describe("stocks and winning", () => {
  it("a blast-zone KO costs a stock and credits the attacker", () => {
    let s = fight();
    s = edit(s, 1, { x: STAGE.blast.right + 1, y: -100, lastHitBy: 0, lastHitTick: s.tick });
    s = step(s, [NO_INPUT, NO_INPUT]);
    expect(f(s, 1).stocks).toBe(2);
    expect(f(s, 1).falls).toBe(1);
    expect(f(s, 0).kos).toBe(1);
    expect(f(s, 1).action).toBe("dead");
    const ko = s.events.find((e) => e.type === "ko");
    expect(ko).toMatchObject({ slot: 1, by: 0 });
    expect(s.phase).toBe("fight");
  });
  it("respawns with invuln and reset damage", () => {
    let s = fight();
    s = edit(s, 1, { x: 0, y: STAGE.blast.bottom + 5, damage: 80 });
    s = step(s, [NO_INPUT, NO_INPUT]);
    s = run(s, 100, [NO_INPUT, NO_INPUT]);
    expect(f(s, 1).action).not.toBe("dead");
    expect(f(s, 1).damage).toBe(0);
    expect(f(s, 1).stocks).toBe(2);
    expect(f(s, 1).invuln).toBeGreaterThan(0);
  });
  it("the last fighter standing wins and the phase ends", () => {
    let s = fight(2, 1);
    s = edit(s, 1, { x: STAGE.blast.left - 5 });
    s = step(s, [NO_INPUT, NO_INPUT]);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe(0);
    expect(s.events.some((e) => e.type === "end" && e.winner === 0)).toBe(true);
    const after = step(s, [IN(BTN.JUMP), IN(BTN.JUMP)]);
    expect(after.winner).toBe(0);
    expect(after.phase).toBe("ended");
    expect(JSON.stringify(after.fighters)).toBe(JSON.stringify(s.fighters));
  });
  it("a three-fighter match continues until one remains", () => {
    let s = fight(3, 1);
    s = edit(s, 2, { x: STAGE.blast.left - 5 });
    s = step(s, [NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(s.phase).toBe("fight");
    s = edit(s, 1, { x: STAGE.blast.left - 5 });
    s = step(s, [NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe(0);
  });
});

describe("determinism", () => {
  const script = (t: number): Input[] => [
    IN(t % 37 === 0 ? BTN.JUMP : t % 53 === 0 ? BTN.ATTACK : 0, ((t * 7) % 200) - 100, (t % 90) - 45),
    IN(t % 41 === 0 ? BTN.SPECIAL : t % 29 === 0 ? BTN.ATTACK : 0, ((t * 11) % 200) - 100, 0),
  ];
  const play = (alt = false) => {
    let s = createMatch([{ slot: 0, fighter: "brush" }, { slot: 1, fighter: "blot" }], 99);
    for (let t = 0; t < 600; t++) {
      s = step(s, alt && t >= 200 && t < 210 ? [IN(BTN.JUMP, 100), IN(BTN.SPECIAL, -100)] : script(t));
    }
    return hashState(s);
  };
  it("same inputs give the same hash", () => {
    expect(play()).toBe(play());
  });
  it("different inputs give a different hash", () => {
    expect(play(true)).not.toBe(play());
  });
  it("cpu play is deterministic and never advances the rng", () => {
    const go = () => {
      let s = fight();
      s = edit(s, 0, { cpu: true });
      s.nextItemTick = null; // items are the rng's only consumer; isolate the cpu
      const rng = s.rng;
      for (let i = 0; i < 600; i++) s = step(s, [cpuInput(s, 0), cpuInput(s, 1)]);
      expect(s.rng).toBe(rng);
      return hashState(s);
    };
    expect(go()).toBe(go());
  });
});

describe("movement", () => {
  it("never tunnels through the ground at fast-fall speed", () => {
    let s = fight();
    s = edit(s, 0, { x: -300, y: -400, grounded: false, vy: 40, fastFalling: true });
    for (let i = 0; i < 40; i++) {
      s = step(s, [IN(0, 0, 100), NO_INPUT]);
      expect(f(s, 0).y).toBeLessThanOrEqual(0);
    }
    expect(f(s, 0).y).toBe(0);
    expect(f(s, 0).grounded).toBe(true);
  });
  it("lands on a platform from above, then drops through with stick down", () => {
    let s = fight();
    s = edit(s, 0, { x: 150, y: -300, grounded: false, vy: 0 });
    for (let i = 0; i < 120 && !f(s, 0).grounded; i++) s = step(s, [NO_INPUT, NO_INPUT]);
    expect(f(s, 0).y).toBe(-110);
    expect(f(s, 0).grounded).toBe(true);
    s = run(s, 5, [NO_INPUT, NO_INPUT]);
    expect(f(s, 0).y).toBe(-110);
    s = step(s, [IN(0, 0, 100), NO_INPUT]);
    for (let i = 0; i < 60; i++) s = step(s, [IN(0, 0, 100), NO_INPUT]);
    expect(f(s, 0).y).toBe(0);
  });
  it("rises through a platform from below and lands on top of it", () => {
    let s = fight();
    s = edit(s, 0, { x: 150, y: -20, grounded: false, vy: -14 });
    for (let i = 0; i < 80; i++) s = step(s, [NO_INPUT, NO_INPUT]);
    expect(f(s, 0).y).toBe(-110);
  });
  it("the ground is solid from below and the side", () => {
    let s = fight();
    s = edit(s, 0, { x: -400, y: 60, grounded: false, vy: 0, vx: 10 });
    for (let i = 0; i < 80; i++) {
      s = step(s, [IN(0, 100), NO_INPUT]);
      const x = f(s, 0).x;
      if (f(s, 0).y > 0) expect(x <= STAGE.ground.x1 || x >= STAGE.ground.x2).toBe(true);
    }
  });
  it("double jumps only once per airtime", () => {
    let s = fight();
    s = step(s, [IN(BTN.JUMP), NO_INPUT]);
    s = step(s, [IN(0), NO_INPUT]);
    s = run(s, 3, [IN(0), NO_INPUT]);
    expect(f(s, 0).grounded).toBe(false);
    let jumps = 0;
    for (let i = 0; i < 6; i++) {
      s = step(s, [IN(i % 2 === 0 ? BTN.JUMP : 0), NO_INPUT]);
      if (has(s, "jump")) jumps++;
    }
    expect(jumps).toBe(1);
    expect(f(s, 0).jumpsLeft).toBe(0);
    // Landing restores it.
    for (let i = 0; i < 200 && !f(s, 0).grounded; i++) s = step(s, [NO_INPUT, NO_INPUT]);
    expect(f(s, 0).jumpsLeft).toBe(1);
  });
  it("fast-fall speeds up the fall", () => {
    const fall = (y: number) => {
      let s = fight();
      s = edit(s, 0, { x: 0, y: -600, grounded: false, vy: 3 });
      s = run(s, 30, [IN(0, 0, y), NO_INPUT]);
      return f(s, 0).y;
    };
    expect(fall(100)).toBeGreaterThan(fall(0));
  });
});

describe("combat", () => {
  it("a trade damages both fighters on the same frame", () => {
    let s = fight();
    s = edit(s, 0, { x: -15, facing: 1 });
    s = edit(s, 1, { x: 15, facing: -1 });
    s = step(s, [IN(BTN.ATTACK), IN(BTN.ATTACK)]);
    const hits: unknown[] = [];
    for (let i = 0; i < 12; i++) {
      s = step(s, [NO_INPUT, NO_INPUT]);
      hits.push(...s.events.filter((e) => e.type === "hit"));
      if (hits.length) break;
    }
    expect(hits.length).toBe(2);
    expect(f(s, 0).damage).toBeGreaterThan(0);
    expect(f(s, 1).damage).toBeGreaterThan(0);
  });
  it("a move hits a given target only once", () => {
    let s = fight();
    s = edit(s, 0, { x: 0, facing: 1 });
    s = edit(s, 1, { x: 30, facing: -1, invuln: 0 });
    s = edit(s, 1, { damage: 0 });
    s = step(s, [IN(BTN.ATTACK, 100), NO_INPUT]);
    s = run(s, 40, [NO_INPUT, NO_INPUT]);
    expect(f(s, 1).damage).toBe(FIGHTERS.wanderer.moves.strong.hitboxes[0].damage);
  });
  it("invulnerable fighters can't be hit", () => {
    let s = fight();
    s = edit(s, 0, { x: 0, facing: 1 });
    s = edit(s, 1, { x: 30, facing: -1, invuln: 100 });
    s = step(s, [IN(BTN.ATTACK, 100), NO_INPUT]);
    s = run(s, 30, [NO_INPUT, NO_INPUT]);
    expect(f(s, 1).damage).toBe(0);
  });
  it("hitstop freezes both fighters briefly", () => {
    let s = fight();
    s = edit(s, 0, { x: 0, facing: 1 });
    s = edit(s, 1, { x: 30, facing: -1 });
    s = step(s, [IN(BTN.ATTACK, 100), NO_INPUT]);
    for (let i = 0; i < 14 && !has(s, "hit"); i++) s = step(s, [NO_INPUT, NO_INPUT]);
    expect(has(s, "hit")).toBe(true);
    expect(f(s, 0).hitstop).toBeGreaterThan(0);
    expect(f(s, 1).hitstop).toBeGreaterThan(0);
  });
  it("shield blocks damage and drains; breaks at zero", () => {
    let s = fight();
    s = edit(s, 0, { x: 0, facing: 1 });
    s = edit(s, 1, { x: 30, facing: -1 });
    s = step(s, [IN(BTN.ATTACK, 100), IN(BTN.SHIELD)]);
    for (let i = 0; i < 14; i++) s = step(s, [NO_INPUT, IN(BTN.SHIELD)]);
    expect(f(s, 1).damage).toBe(0);
    expect(f(s, 1).shield).toBeLessThan(100);
    expect(f(s, 1).action).toBe("shield");
    s = edit(s, 1, { shield: 1 });
    s = edit(s, 0, { action: "idle", hitThisMove: 0 });
    s = step(s, [IN(BTN.ATTACK, 100), IN(BTN.SHIELD)]);
    for (let i = 0; i < 14; i++) s = step(s, [NO_INPUT, IN(BTN.SHIELD)]);
    expect(f(s, 1).hitstun).toBeGreaterThan(0);
  });
  it("a special spawns a projectile that hits and is consumed", () => {
    let s = fight();
    s = edit(s, 0, { x: -100, facing: 1 });
    s = edit(s, 1, { x: 100, facing: -1 });
    s = step(s, [IN(BTN.SPECIAL), NO_INPUT]);
    let spawned = false;
    for (let i = 0; i < 60; i++) {
      s = step(s, [NO_INPUT, NO_INPUT]);
      if (s.projectiles.length) spawned = true;
    }
    expect(spawned).toBe(true);
    expect(f(s, 1).damage).toBe(FIGHTERS.wanderer.moves.special.projectile!.damage);
    expect(s.projectiles.length).toBe(0);
  });
});

describe("dropped players (ADR 0001)", () => {
  it("null input marks the fighter absent with a drop event and no hurtbox", () => {
    let s = fight();
    s = step(s, [NO_INPUT, null]);
    expect(f(s, 1).absentSince).not.toBeNull();
    expect(has(s, "drop")).toBe(true);
    // An attack straight through its position hits nothing.
    s = edit(s, 0, { x: f(s, 1).x - 30, facing: 1 });
    s = step(s, [IN(BTN.ATTACK, 100), null]);
    s = run(s, 30, [NO_INPUT, null]);
    expect(f(s, 1).damage).toBe(0);
    expect(f(s, 1).stocks).toBe(3);
  });
  it("coming back within grace keeps damage and stocks, respawns with invuln", () => {
    let s = fight();
    s = edit(s, 1, { damage: 42 });
    s = run(s, 100, [NO_INPUT, null]);
    s = step(s, [NO_INPUT, NO_INPUT]);
    expect(has(s, "back")).toBe(true);
    expect(f(s, 1).absentSince).toBeNull();
    expect(f(s, 1).damage).toBe(42);
    expect(f(s, 1).stocks).toBe(3);
    expect(f(s, 1).invuln).toBeGreaterThan(0);
    expect(f(s, 1).x).toBe(STAGE.respawn.x);
  });
  it("does not end the match while someone is absent in grace", () => {
    let s = fight(3, 1);
    s = edit(s, 2, { x: STAGE.blast.left - 5 });
    s = step(s, [NO_INPUT, null, NO_INPUT]);
    s = edit(s, 0, { x: STAGE.blast.left - 5 });
    s = step(s, [NO_INPUT, null, NO_INPUT]);
    expect(f(s, 0).stocks).toBe(0);
    expect(s.phase).toBe("fight");
  });
  it("forfeits after 900 null ticks: stocks 0, match ends, the other wins", () => {
    let s = fight();
    s = run(s, GRACE_TICKS - 1, [NO_INPUT, null]);
    expect(f(s, 1).forfeited).toBe(false);
    s = step(s, [NO_INPUT, null]);
    expect(f(s, 1).forfeited).toBe(true);
    expect(f(s, 1).stocks).toBe(0);
    expect(has(s, "forfeit")).toBe(true);
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe(0);
  });
  it("a forfeited fighter cannot come back", () => {
    let s = fight(3);
    s = run(s, GRACE_TICKS, [NO_INPUT, null, NO_INPUT]);
    expect(f(s, 1).forfeited).toBe(true);
    s = step(s, [NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(f(s, 1).forfeited).toBe(true);
    expect(f(s, 1).stocks).toBe(0);
  });
});

describe("cpu", () => {
  it("heads for the stage when off it", () => {
    let s = fight();
    s = edit(s, 0, { x: -450, y: 100, grounded: false, vy: 3, jumpsLeft: 1 });
    expect(cpuInput(s, 0).x).toBeGreaterThan(0);
    expect(cpuInput(s, 0).b & BTN.JUMP).toBe(BTN.JUMP);
  });
  it("recovers from off-stage and approaches opponents", () => {
    let s = fight();
    s = edit(s, 0, { x: -380, y: 40, grounded: false, vy: -6, jumpsLeft: 1, cpu: true });
    for (let i = 0; i < 200; i++) s = step(s, [cpuInput(s, 0), NO_INPUT]);
    expect(f(s, 0).stocks).toBe(3);
    expect(Math.abs(f(s, 0).x)).toBeLessThan(400);
  });
  it("returns an in-range input", () => {
    let s = fight();
    for (let i = 0; i < 300; i++) {
      const a = cpuInput(s, 0);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(100);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(100);
      expect(a.b & ~15).toBe(0);
      s = step(s, [a, cpuInput(s, 1)]);
    }
  });
});

describe("ink pots", () => {
  const away = [NO_INPUT, NO_INPUT];
  function untilItem(s: MatchState, max = 2000): MatchState {
    for (let i = 0; i < max && s.items.length === 0; i++) s = step(s, away);
    return s;
  }
  it("spawns one within the interval window, above the ground span", () => {
    let s = fight();
    const start = s.tick;
    s = untilItem(s);
    expect(s.items.length).toBe(1);
    expect(s.tick - start).toBeGreaterThanOrEqual(ITEM_INTERVAL - ITEM_JITTER);
    expect(s.tick - start).toBeLessThanOrEqual(ITEM_INTERVAL + ITEM_JITTER + 2);
    expect(s.items[0].x).toBeGreaterThanOrEqual(STAGE.ground.x1);
    expect(s.items[0].x).toBeLessThanOrEqual(STAGE.ground.x2);
  });
  it("does not spawn a second while one is on the stage, nor when items are off", () => {
    let s = untilItem(fight());
    s = edit(s, 0, { x: -600, y: 0 }); // keep fighters off it
    s = run(s, 3 * ITEM_INTERVAL, away);
    expect(s.items.length).toBeLessThanOrEqual(1);
    let off = createMatch([{ slot: 0, fighter: "wanderer" }, { slot: 1, fighter: "wanderer" }], 7, { items: false });
    while (off.phase === "countdown") off = step(off, []);
    off = run(off, 2 * ITEM_INTERVAL, away);
    expect(off.items.length).toBe(0);
  });
  it("falls and lands on a surface", () => {
    let s = untilItem(fight());
    const it0 = s.items[0];
    for (let i = 0; i < 400 && !s.items[0]?.grounded; i++) {
      s = edit(s, 0, { x: -300, y: 0 });
      s = edit(s, 1, { x: 300, y: 0 });
      s = step(s, away);
    }
    const it = s.items.find((i) => i.id === it0.id);
    if (it) {
      expect(it.grounded).toBe(true);
      expect([0, -110, -210]).toContain(it.y);
    }
  });
  it("touching it sets inked and emits pickup", () => {
    let s = untilItem(fight());
    const it = s.items[0];
    s = edit(s, 0, { x: it.x, y: 0 });
    let got = false;
    for (let i = 0; i < 300 && !got; i++) {
      s = edit(s, 0, { x: it.x, y: Math.max(f(s, 0).y, 0) });
      s = step(s, away);
      got = has(s, "pickup");
    }
    expect(got).toBe(true);
    expect(f(s, 0).inked).toBeGreaterThan(INK_FRAMES - 5);
    expect(s.items.length).toBe(0);
  });
  it("an inked hit does more damage than an identical plain hit", () => {
    const hit = (inked: number) => {
      let s = fight();
      s = edit(s, 0, { x: 0, facing: 1, inked });
      s = edit(s, 1, { x: 30, facing: -1 });
      s = step(s, [IN(BTN.ATTACK, 100), NO_INPUT]);
      s = run(s, 14, away);
      return f(s, 1).damage;
    };
    const plain = hit(0);
    expect(plain).toBeGreaterThan(0);
    expect(hit(300)).toBeCloseTo(plain * 1.4);
  });
  it("same seed gives the same item positions, different seeds usually differ", () => {
    const drops = (seed: number) => {
      let s = createMatch([{ slot: 0, fighter: "wanderer" }, { slot: 1, fighter: "wanderer" }], seed);
      const out: number[] = [];
      for (let i = 0; i < 4000; i++) {
        s = step(s, [null, null].map(() => NO_INPUT));
        if (s.items.length && out[out.length - 1] !== s.items[0].id) out.push(s.items[0].id, s.items[0].x, s.tick);
      }
      return out;
    };
    expect(drops(5)).toEqual(drops(5));
    expect(drops(5)).not.toEqual(drops(6));
  });
  it("the determinism hash covers items over 1500 ticks", () => {
    const go = () => {
      let s = createMatch([{ slot: 0, fighter: "brush" }, { slot: 1, fighter: "blot" }], 11);
      let seen = false;
      for (let t = 0; t < 1500; t++) {
        s = step(s, [IN(t % 31 === 0 ? BTN.JUMP : 0, (t % 120) - 60), IN(t % 47 === 0 ? BTN.ATTACK : 0, 0)]);
        if (s.items.length) seen = true;
      }
      expect(seen).toBe(true);
      return hashState(s);
    };
    expect(go()).toBe(go());
  });
});

describe("landing and the ledge", () => {
  const ids = ["brush", "carver", "blot", "wanderer"] as const;
  function jumpIn(id: (typeof ids)[number], stick: number) {
    let s = createMatch([{ slot: 0, fighter: id }, { slot: 1, fighter: "wanderer" }], 1);
    while (s.phase === "countdown") s = step(s, []);
    s = edit(s, 0, { x: -100 });
    s = edit(s, 1, { x: 300 });
    s = step(s, [IN(BTN.JUMP, stick), NO_INPUT]);
    for (let i = 0; i < 200; i++) {
      s = step(s, [IN(0, stick), NO_INPUT]);
      if (f(s, 0).grounded && i > 3) break;
    }
    return f(s, 0);
  }
  for (const id of ids) {
    it(`${id}: a jump in place lands where it started`, () => {
      const l = jumpIn(id, 0);
      expect(l.grounded).toBe(true);
      expect(Math.abs(l.x + 100)).toBeLessThan(3);
    });
    it(`${id}: a walking jump lands in the stage's interior, not on the edge`, () => {
      const l = jumpIn(id, 100);
      expect(l.grounded).toBe(true);
      expect(l.x).toBeGreaterThan(-100);
      expect(Math.abs(l.x)).toBeLessThan(250);
    });
  }
  it("a jab at 0% from centre does not shove the victim to the edge", () => {
    let s = fight();
    s = edit(s, 0, { x: 0, facing: 1 });
    s = edit(s, 1, { x: 30, facing: -1 });
    s = step(s, [IN(BTN.ATTACK), NO_INPUT]);
    s = run(s, 120, [NO_INPUT, NO_INPUT]);
    expect(f(s, 1).stocks).toBe(3);
    expect(Math.abs(f(s, 1).x)).toBeLessThan(150);
  });
  it("ledge assist lifts a fighter just below and beside the edge onto the corner", () => {
    for (const side of [-1, 1]) {
      let s = fight();
      const edge = side < 0 ? STAGE.ground.x1 : STAGE.ground.x2;
      s = edit(s, 0, { x: edge + side * 10, y: 20, vx: 0, vy: 2, grounded: false, jumpsLeft: 0 });
      s = step(s, [IN(0, -side * 100), NO_INPUT]);
      expect(f(s, 0).grounded).toBe(true);
      expect(f(s, 0).y).toBe(0);
      expect(Math.abs(f(s, 0).x)).toBeCloseTo(Math.abs(edge) - 4, 0);
      expect(f(s, 0).jumpsLeft).toBe(1);
    }
  });
  it("ledge assist does not apply too deep, too far out, or during hitstun", () => {
    const tryIt = (patch: object) => {
      let s = fight();
      s = edit(s, 0, { grounded: false, vy: 2, vx: 0, ...patch });
      s = step(s, [IN(0, 100), NO_INPUT]);
      return f(s, 0).grounded;
    };
    expect(tryIt({ x: -340, y: 80 })).toBe(false);
    expect(tryIt({ x: -400, y: 20 })).toBe(false);
    expect(tryIt({ x: -340, y: 20, hitstun: 10 })).toBe(false);
  });
  it("hitstun ending in the air restores the double jump", () => {
    let s = fight();
    s = edit(s, 0, { x: 0, y: -200, grounded: false, vy: 0, hitstun: 3, jumpsLeft: 0, action: "hitstun" });
    s = run(s, 4, [NO_INPUT, NO_INPUT]);
    expect(f(s, 0).hitstun).toBe(0);
    expect(f(s, 0).jumpsLeft).toBe(1);
  });
});
