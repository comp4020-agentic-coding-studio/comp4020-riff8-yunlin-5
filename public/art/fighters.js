// Fighter drawing: four original ink-brush figures as Canvas paths.
// drawFighter(ctx, f, opts): ctx is at the feet, flipped by facing, +x forward,
// negative y up. f is an interpolated SnapFighter; opts = { ink, time }.
// Reach of each attack pose roughly matches the hitboxes in src/sim/fighters/index.ts.

export const FIGHTER_INFO = {
  brush: { name: "Great Brush 巨筆", blurb: "Heavy and slow, with a brush as long as a spear. One stroke ends a stock." },
  carver: { name: "Seal Carver 刻印", blurb: "Light and quick. Many small cuts, and a dash that bites." },
  blot: { name: "Ink Blot 潑墨", blurb: "Keeps away and flings arcing ink. Weak when cornered." },
  wanderer: { name: "Wanderer 遊士", blurb: "A scholar with a staff. Balanced; nothing wasted." },
};

const INK = "#1f1b16";
const PI = Math.PI;
const D = PI / 180;

// per-fighter build: scale, arm length, tool length behind/ahead of the hand, resting tool angle
const CFG = {
  brush: { s: 1.2, arm: 18, back: 4, ahead: 52, rest: -50 * D, toolW: 4.5 },
  carver: { s: 0.82, arm: 14, back: 2, ahead: 20, rest: -20 * D, toolW: 4 },
  blot: { s: 0.96, arm: 16, back: 2, ahead: 16, rest: 20 * D, toolW: 3.5 },
  wanderer: { s: 1, arm: 16, back: 22, ahead: 34, rest: -90 * D, toolW: 3.5 },
};

const ease = (e) => e * e * (3 - 2 * e);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function stroke(ctx, w, x1, y1, cx, cy, x2, y2) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
}

function limb(ctx, x1, y1, x2, y2, x3, y3, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(x2, y2, x3, y3);
  ctx.stroke();
}

// attack tool angle (radians, 0 = forward, negative = up) by move and frame
function attackAngle(id, a, fr) {
  if (a === "jab") {
    const e = ease(clamp01(fr / 4));
    return lerp(id === "brush" ? -40 * D : -20 * D, -4 * D, e);
  }
  if (a === "strong") {
    const total = id === "brush" ? 16 : id === "carver" ? 7 : id === "blot" ? 10 : 12;
    const e = ease(clamp01(fr / total));
    return lerp(-125 * D, 15 * D, e);
  }
  if (a === "aerial") {
    const spin = id === "carver" ? 0.9 : 0.55;
    return -100 * D + fr * spin;
  }
  // special
  if (id === "brush") {
    const e = ease(clamp01((fr - 8) / 18));
    return fr < 8 ? lerp(-60 * D, 70 * D, fr / 8) : lerp(70 * D, -120 * D, e);
  }
  if (id === "carver") return -4 * D;
  if (id === "blot") {
    if (fr < 12) return lerp(-60 * D, -165 * D, ease(fr / 12));
    return lerp(-165 * D, -10 * D, ease(clamp01((fr - 12) / 5)));
  }
  return -8 * D; // wanderer: staff thrust, sending a wave
}

function drawTool(ctx, id, c, hx, hy, ang, ink, fr, a) {
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const bx = hx - cs * c.back;
  const by = hy - sn * c.back;
  const tx = hx + cs * c.ahead;
  const ty = hy + sn * c.ahead;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  if (id === "brush") {
    // bamboo handle, then a fat ink-loaded tip
    ctx.lineWidth = c.toolW;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(hx + cs * c.ahead * 0.62, hy + sn * c.ahead * 0.62);
    ctx.stroke();
    ctx.lineWidth = c.toolW * 2.6;
    ctx.beginPath();
    ctx.moveTo(hx + cs * c.ahead * 0.62, hy + sn * c.ahead * 0.62);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx + cs * c.ahead * 0.55 - sn * 2, hy + sn * c.ahead * 0.55 + cs * 2);
    ctx.lineTo(hx + cs * c.ahead * 0.62 - sn * 2, hy + sn * c.ahead * 0.62 + cs * 2);
    ctx.stroke();
  } else if (id === "carver") {
    // chisel with a small square seal-head at the back
    ctx.lineWidth = c.toolW;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + cs * 5, ty + sn * 5);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillRect(bx - 4, by - 4, 8, 8);
  } else if (id === "blot") {
    // ink-stick in hand; before the throw, a swelling blot
    ctx.lineWidth = c.toolW;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    if (a === "special" && fr < 13) {
      const r = 4 + fr * 0.7;
      ctx.beginPath();
      ctx.arc(tx + cs * r * 0.6, ty + sn * r * 0.6, r, 0, PI * 2);
      ctx.fill();
    }
  } else {
    // staff with a slot-coloured tassel near the top
    ctx.lineWidth = c.toolW;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx - cs * 4, ty - sn * 4);
    ctx.quadraticCurveTo(tx - cs * 6 - sn * 3, ty - sn * 6 + cs * 6, tx - cs * 6 - sn * 2, ty - sn * 6 + cs * 12);
    ctx.stroke();
  }
}

function drawHat(ctx, id, hx, hy, ink, t) {
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  if (id === "brush") {
    // topknot and a plain headband in the slot colour
    ctx.beginPath();
    ctx.arc(hx - 2, hy - 11, 4.5, 0, PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy - 3);
    ctx.lineTo(hx + 8, hy - 4);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy - 3);
    ctx.quadraticCurveTo(hx - 15, hy, hx - 17, hy + 6 + Math.sin(t * 5) * 1.5);
    ctx.stroke();
  } else if (id === "carver") {
    // small flat cap with a trailing tail
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy - 4);
    ctx.lineTo(hx + 8, hy - 4);
    ctx.lineTo(hx + 6, hy - 11);
    ctx.lineTo(hx - 6, hy - 11);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, 2.5, hx - 7, hy - 8, hx - 14, hy - 8, hx - 18, hy - 2 + Math.sin(t * 7) * 2);
  } else if (id === "blot") {
    // wide round brim, low dome
    ctx.beginPath();
    ctx.ellipse(hx, hy - 4, 17, 4, 0, 0, PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx, hy - 7, 9, 7, 0, PI, PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy - 5);
    ctx.lineTo(hx + 8, hy - 5);
    ctx.stroke();
  } else {
    // conical bamboo hat
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy - 3);
    ctx.quadraticCurveTo(hx - 6, hy - 6, hx, hy - 20);
    ctx.quadraticCurveTo(hx + 6, hy - 6, hx + 18, hy - 3);
    ctx.quadraticCurveTo(hx, hy - 8, hx - 18, hy - 3);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy - 4);
    ctx.lineTo(hx - 6, hy + 5);
    ctx.stroke();
  }
}

// robe: filled ink-wash shape from shoulders to just above the knees
function drawRobe(ctx, id, sh, hip, hem, sway) {
  const w = id === "brush" ? 16 : id === "carver" ? 9 : id === "blot" ? 14 : 11;
  const flare = id === "brush" ? 9 : id === "blot" ? 8 : id === "wanderer" ? 6 : 3;
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(sh[0] - w * 0.55, sh[1]);
  ctx.quadraticCurveTo(hip[0] - w - 2, hip[1], hip[0] - w - flare + sway, hem);
  ctx.lineTo(hip[0] + w + flare + sway, hem);
  ctx.quadraticCurveTo(hip[0] + w + 2, hip[1], sh[0] + w * 0.55, sh[1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // lighter wash stripe down the front: the paper showing through
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "#f3efe4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sh[0] + 2, sh[1] + 4);
  ctx.quadraticCurveTo(hip[0] + 3, hip[1], hip[0] + 3 + sway, hem - 2);
  ctx.stroke();
  ctx.restore();
}

export function drawFighter(ctx, f, opts = {}) {
  const id = CFG[f.fighter] ? f.fighter : "wanderer";
  const c = CFG[id];
  const ink = opts.ink || INK;
  const t = (opts.time || 0) / 60;
  const a = f.action;
  const fr = f.frame || 0;

  if (a === "dead") {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(0, -2, 22, 5, 0, 0, PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;

  if (a === "shield") {
    const s = Math.max(0.25, (f.shield ?? 100) / 100);
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.2 * s;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0, -36 * c.s, 30 * c.s + 8, 42 * c.s + 4, 0, 0, PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  ctx.scale(c.s, c.s);
  if (a === "hitstun") {
    const spin = Math.min(0.9, fr * 0.04);
    ctx.translate(0, -34);
    ctx.rotate(-0.35 - spin);
    ctx.translate(0, 34);
  }

  let lean = 0;
  let crouch = 0;
  let legA = [8, 0];
  let legB = [-8, 0];
  let armF = [10, -34];
  let armB = [-10, -30];
  let toolAng = c.rest;
  const attacking = a === "jab" || a === "strong" || a === "aerial" || a === "special";
  const airborne = a === "jump" || a === "fall";
  const swing = Math.sin(t * (id === "carver" ? 18 : id === "brush" ? 9 : 14));
  const breathe = Math.sin(t * 3);

  if (a === "run") {
    lean = id === "carver" ? 9 : 5;
    legA = [swing * 14, -Math.max(0, -swing) * 8];
    legB = [-swing * 14, -Math.max(0, swing) * 8];
    armF = [-swing * 10 + 6, -32];
    armB = [swing * 10 - 4, -34];
  } else if (airborne) {
    legA = [8, -10];
    legB = [-6, -6];
    armF = [14, -48 + (f.vy < 0 ? -6 : 4)];
    armB = [-14, -50];
    if (id === "wanderer") toolAng = f.vy < 0 ? -110 * D : -60 * D;
  } else if (a === "shield") {
    crouch = 6;
    armF = [14, -34];
    armB = [14, -26];
  } else if (a === "hitstun") {
    lean = -10;
    armF = [-12, -50];
    armB = [-22, -34];
    legA = [8, -6];
    legB = [-10, -2];
    toolAng = 160 * D;
  } else if (attacking) {
    lean = a === "strong" ? 10 : a === "special" && id === "carver" ? 18 : 5;
    crouch = a === "strong" ? 4 : 0;
    legA = a === "aerial" ? [10, -14] : [14, 0];
    legB = a === "aerial" ? [-10, -14] : [-14, 0];
    toolAng = attackAngle(id, a, fr);
    armB = [-14, -40];
    if (a === "special" && id === "carver") armB = [-24, -30];
  } else {
    crouch = breathe * 1.2;
    armF = [10, -34 + breathe * 1.5];
    armB = [-10, -32];
    if (id === "brush") toolAng = c.rest + breathe * 0.04;
  }

  const hipY = -30 + crouch;
  const hip = [0, hipY];
  const sh = [lean, hipY - 24];
  const head = [lean * 1.4, hipY - 38];
  if (attacking) {
    // the front arm and tool are one line from the shoulder
    armF = [sh[0] + Math.cos(toolAng) * c.arm, sh[1] + Math.sin(toolAng) * c.arm];
  }

  // streak lines behind a dash
  if (a === "special" && id === "carver" && fr >= 4 && fr <= 18) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 3; i++) {
      stroke(ctx, 2.5 - i * 0.5, -14 - i * 6, -18 - i * 12, -36 - i * 8, -18 - i * 12, -60 - i * 10, -16 - i * 12);
    }
    ctx.restore();
  }

  // legs
  limb(ctx, 0, hipY, legA[0] * 0.5 + 3, -14 + legA[1] * 0.5, legA[0], legA[1], 6);
  limb(ctx, 0, hipY, legB[0] * 0.5 - 2, -14 + legB[1] * 0.5, legB[0], legB[1], 5);
  // back arm behind the robe
  limb(ctx, sh[0], sh[1], (sh[0] + armB[0]) / 2, (sh[1] + armB[1]) / 2 + 3, armB[0], armB[1], 4);
  drawRobe(ctx, id, sh, hip, hipY + 14, lean * 0.3 - (a === "run" ? 3 : 0));
  // sash and a small seal chop, both in the slot colour
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sh[0] - 7, sh[1] + 7);
  ctx.lineTo(hip[0] + 7, hip[1] - 4);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fillRect(hip[0] - 4, hip[1] - 2, 8, 8);
  // head
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(head[0], head[1], id === "carver" ? 7.5 : 8.5, 0, PI * 2);
  ctx.fill();
  drawHat(ctx, id, head[0], head[1], ink, t);
  // front arm and tool
  ctx.strokeStyle = INK;
  limb(ctx, sh[0], sh[1], (sh[0] + armF[0]) / 2, (sh[1] + armF[1]) / 2 + (attacking ? 0 : 3), armF[0], armF[1], 5);
  drawTool(ctx, id, c, armF[0], armF[1], toolAng, ink, fr, a);
  ctx.restore();
}
