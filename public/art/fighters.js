// Placeholder brush-stroke figure (M1). The API is the contract:
// drawFighter(ctx, f, opts): ctx is at the feet, flipped by facing, +x forward,
// negative y up. f is an interpolated SnapFighter; opts = { ink, time }.

export const FIGHTER_INFO = {
  brush: { name: "Great Brush", blurb: "Heavy and slow. One stroke ends a stock." },
  carver: { name: "Seal Carver", blurb: "Light and quick. Many small cuts." },
  blot: { name: "Blot Thrower", blurb: "Keeps away and flings ink." },
  wanderer: { name: "Wanderer", blurb: "Balanced. Nothing wasted." },
};

const INK = "#1f1b16";

function limb(ctx, x1, y1, x2, y2, x3, y3, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.stroke();
}

export function drawFighter(ctx, f, opts = {}) {
  const ink = opts.ink || INK;
  const t = (opts.time || 0) / 60;
  const a = f.action;
  const fr = f.frame || 0;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;

  if (a === "shield") {
    const s = Math.max(0.25, (f.shield ?? 100) / 100);
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.2 * s;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0, -36, 34, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // pose parameters: hip, shoulder, head, arm/leg targets
  let lean = 0;
  let crouch = 0;
  let legA = [0, 0];
  let legB = [0, 0];
  let armF = [10, -36];
  let armB = [-10, -30];
  const airborne = a === "jump" || a === "fall";
  const swing = Math.sin(t * 14);
  if (a === "run") {
    lean = 5;
    legA = [swing * 14, -Math.max(0, -swing) * 8];
    legB = [-swing * 14, -Math.max(0, swing) * 8];
    armF = [-swing * 10 + 4, -34];
    armB = [swing * 10 - 4, -34];
  } else if (airborne) {
    legA = [8, -10];
    legB = [-6, -6];
    armF = [14, -52 + (f.vy < 0 ? -6 : 4)];
    armB = [-14, -50];
  } else if (a === "jab") {
    lean = 6;
    const e = Math.min(1, fr / 4);
    armF = [30 * e + 10, -42];
    armB = [-12, -34];
    legA = [8, 0];
    legB = [-8, 0];
  } else if (a === "strong") {
    lean = 12;
    const e = Math.min(1, fr / 8);
    armF = [44 * e + 8, -40 + 4 * e];
    armB = [-16, -44];
    legA = [14, 0];
    legB = [-14, 0];
    crouch = 4;
  } else if (a === "aerial") {
    lean = 0;
    const ang = fr * 0.7;
    armF = [Math.cos(ang) * 34, -36 + Math.sin(ang) * 30];
    armB = [-Math.cos(ang) * 34, -36 - Math.sin(ang) * 30];
    legA = [10, -14];
    legB = [-10, -14];
  } else if (a === "special") {
    lean = -4;
    armF = [34, -40];
    armB = [28, -34];
    legA = [10, 0];
    legB = [-10, 0];
  } else if (a === "hitstun") {
    lean = -14;
    armF = [-12, -50];
    armB = [-22, -34];
    legA = [8, -6];
    legB = [-10, -2];
  } else if (a === "shield") {
    crouch = 6;
    armF = [14, -34];
    armB = [14, -26];
  } else {
    // idle: slow breathing
    crouch = Math.sin(t * 3) * 1.2;
    legA = [8, 0];
    legB = [-8, 0];
    armF = [10, -34 + Math.sin(t * 3) * 1.5];
    armB = [-10, -32];
  }

  const hipY = -30 + crouch;
  const hip = [0, hipY];
  const sh = [lean, hipY - 24];
  const head = [lean * 1.4, hipY - 38];

  // legs
  ctx.lineWidth = 6;
  limb(ctx, hip[0], hip[1], hip[0] + legA[0] * 0.5 + 3, -14 + legA[1] * 0.5, legA[0], legA[1], 6);
  limb(ctx, hip[0], hip[1], hip[0] + legB[0] * 0.5 - 2, -14 + legB[1] * 0.5, legB[0], legB[1], 5);
  // torso: a thick brush stroke that thins toward the hip
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(hip[0], hip[1]);
  ctx.quadraticCurveTo(hip[0] + lean * 0.3, hipY - 12, sh[0], sh[1]);
  ctx.stroke();
  // arms
  limb(ctx, sh[0], sh[1], (sh[0] + armF[0]) / 2, (sh[1] + armF[1]) / 2 + 3, armF[0], armF[1], 5);
  limb(ctx, sh[0], sh[1], (sh[0] + armB[0]) / 2, (sh[1] + armB[1]) / 2 + 3, armB[0], armB[1], 4);
  // head
  ctx.beginPath();
  ctx.arc(head[0], head[1], 8.5, 0, Math.PI * 2);
  ctx.fill();
  // slot-coloured sash: the seal colour that marks who this is
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sh[0] - 5 + lean * 0.1, sh[1] + 9);
  ctx.lineTo(hip[0] + 5, hip[1] - 6);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(head[0] + 4, head[1] - 7, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
