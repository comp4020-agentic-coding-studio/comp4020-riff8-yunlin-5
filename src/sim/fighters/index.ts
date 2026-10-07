// STUB: sim-dev's M1 placeholder replaces this; fighter-designer owns it from M2.
import type { FighterDef, FighterId } from "../types.ts";

const placeholder = (id: FighterId, name: string): FighterDef => ({
  id, name, weight: 100, walkSpeed: 4, airSpeed: 3.5, jumpVel: 11, doubleJumpVel: 10,
  gravity: 0.55, maxFall: 10, fastFall: 15, width: 36, height: 70,
  moves: {
    jab: { frames: 18, hitboxes: [{ start: 4, end: 7, x: 30, y: -40, r: 18, damage: 4, base: 20, growth: 60, angle: 30 }] },
    strong: { frames: 32, hitboxes: [{ start: 10, end: 14, x: 38, y: -38, r: 22, damage: 12, base: 30, growth: 100, angle: 40 }] },
    aerial: { frames: 26, hitboxes: [{ start: 5, end: 14, x: 22, y: -30, r: 24, damage: 9, base: 20, growth: 90, angle: 45 }] },
    special: { frames: 36, hitboxes: [], projectile: { frame: 12, x: 30, y: -40, vx: 7, vy: 0, gravity: 0, life: 60, r: 12, damage: 7, base: 25, growth: 70, angle: 20 } },
  },
});

export const FIGHTERS: Record<FighterId, FighterDef> = {
  brush: placeholder("brush", "Brush"),
  carver: placeholder("carver", "Carver"),
  blot: placeholder("blot", "Blot"),
  wanderer: placeholder("wanderer", "Wanderer"),
};
