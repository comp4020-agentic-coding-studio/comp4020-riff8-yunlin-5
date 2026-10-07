// The four fighters. Numbers are px / frame at 60 Hz; hitbox x is forward-relative,
// y is relative to the feet (negative is up). Drawing lives in public/art/fighters.js
// and its reach should roughly match the hitboxes here.
import type { FighterDef, FighterId } from "../types.ts";

// 墨 Great Brush: heavy, slow, long reach, high knockback.
const brush: FighterDef = {
  id: "brush", name: "Great Brush 巨筆", weight: 125, walkSpeed: 3.4, airSpeed: 3.2, jumpVel: 10.5,
  doubleJumpVel: 9.5, gravity: 0.6, maxFall: 11, fastFall: 15, width: 46, height: 84,
  moves: {
    jab: { frames: 17, hitboxes: [{ start: 4, end: 9, x: 58, y: -44, r: 22, damage: 7, base: 16, growth: 55, angle: 35 }] },
    strong: { frames: 34, hitboxes: [{ start: 12, end: 19, x: 72, y: -46, r: 32, damage: 13, base: 20, growth: 85, angle: 40 }] },
    aerial: { frames: 26, hitboxes: [{ start: 6, end: 17, x: 54, y: -42, r: 34, damage: 9, base: 14, growth: 70, angle: 45 }] },
    special: { frames: 48, hitboxes: [{ start: 18, end: 25, x: 64, y: -24, r: 34, damage: 11, base: 22, growth: 85, angle: 65 }] },
  },
};

// 刻 Seal Carver: light, fast, short reach, a dashing special.
const carver: FighterDef = {
  id: "carver", name: "Seal Carver 刻印", weight: 78, walkSpeed: 5.2, airSpeed: 4.4, jumpVel: 12.5,
  doubleJumpVel: 11, gravity: 0.6, maxFall: 11, fastFall: 17, width: 28, height: 56,
  moves: {
    jab: { frames: 11, hitboxes: [{ start: 2, end: 4, x: 22, y: -30, r: 14, damage: 3, base: 14, growth: 45, angle: 35 }] },
    strong: { frames: 22, hitboxes: [{ start: 6, end: 9, x: 28, y: -28, r: 16, damage: 7, base: 24, growth: 100, angle: 48 }] },
    aerial: { frames: 18, hitboxes: [{ start: 3, end: 10, x: 18, y: -28, r: 20, damage: 6, base: 16, growth: 70, angle: 50 }] },
    special: {
      frames: 28, impulse: { frame: 5, vx: 11, vy: 0 },
      hitboxes: [{ start: 5, end: 14, x: 14, y: -28, r: 22, damage: 7, base: 22, growth: 80, angle: 35 }],
    },
  },
};

// 潑 Blot Thrower: zoner, arcing ink blots, weak up close.
const blot: FighterDef = {
  id: "blot", name: "Ink Blot 潑墨", weight: 92, walkSpeed: 3.6, airSpeed: 3.4, jumpVel: 11.5,
  doubleJumpVel: 10.5, gravity: 0.55, maxFall: 10, fastFall: 15, width: 34, height: 66,
  moves: {
    jab: { frames: 16, hitboxes: [{ start: 4, end: 6, x: 26, y: -38, r: 16, damage: 4, base: 16, growth: 50, angle: 60 }] },
    strong: { frames: 30, hitboxes: [{ start: 9, end: 12, x: 34, y: -36, r: 20, damage: 9, base: 26, growth: 90, angle: 45 }] },
    aerial: { frames: 26, hitboxes: [{ start: 6, end: 14, x: 22, y: -32, r: 22, damage: 7, base: 18, growth: 75, angle: 50 }] },
    special: {
      frames: 34,
      hitboxes: [],
      projectile: { frame: 12, x: 30, y: -42, vx: 6.5, vy: -2.5, gravity: 0.08, life: 75, r: 16, damage: 9, base: 26, growth: 85, angle: 28 },
    },
  },
};

// 遊 Wanderer: scholar with a staff, middling everything; a short staff-wave special.
const wanderer: FighterDef = {
  id: "wanderer", name: "Wanderer 遊士", weight: 100, walkSpeed: 4, airSpeed: 3.6, jumpVel: 11,
  doubleJumpVel: 10, gravity: 0.55, maxFall: 10, fastFall: 15, width: 34, height: 70,
  moves: {
    jab: { frames: 16, hitboxes: [{ start: 4, end: 7, x: 38, y: -40, r: 17, damage: 3, base: 16, growth: 50, angle: 30 }] },
    strong: { frames: 34, hitboxes: [{ start: 11, end: 15, x: 48, y: -38, r: 21, damage: 10, base: 26, growth: 90, angle: 40 }] },
    aerial: { frames: 28, hitboxes: [{ start: 6, end: 15, x: 36, y: -34, r: 25, damage: 7, base: 18, growth: 75, angle: 45 }] },
    special: {
      frames: 34, hitboxes: [],
      projectile: { frame: 10, x: 40, y: -38, vx: 8, vy: 0, gravity: 0, life: 22, r: 14, damage: 6, base: 20, growth: 60, angle: 25 },
    },
  },
};

export const FIGHTERS: Record<FighterId, FighterDef> = { brush, carver, blot, wanderer };
