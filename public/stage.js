// The stage as a corner of a Chinese ink handscroll: paper, far mountains in
// wash, a brushed rock ledge, platforms as single strokes. Geometry comes from
// welcome.stage; everything here is decoration around those surfaces.

const PAPER = "#f3efe4";
const INK = "#1f1b16";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(seed, n, base, amp, rough) {
  const r = rng(seed);
  const pts = [];
  let h = 0.5;
  for (let i = 0; i <= n; i++) {
    h += (r() - 0.5) * rough;
    h = Math.max(0, Math.min(1, h));
    const peak = Math.pow(Math.sin((i / n) * Math.PI * 3 + seed), 2);
    pts.push(base - (h * 0.6 + peak * 0.4) * amp);
  }
  return pts;
}

let cache = null;
const keyOf = (stage) => JSON.stringify([stage.ground, stage.platforms]);
const kindOf = (stage) => stage.id || (stage.ground.x2 < 300 ? "pinecliff" : "riverbank");

function build(stage) {
  const kind = kindOf(stage);
  return kind === "pinecliff" ? buildPine(stage) : buildRiver(stage);
}

function buildRiver(stage) {
  const g = stage.ground;
  const r = rng(7);
  // rock underside: tapering polygon with a ragged outline
  const rock = [];
  const w = g.x2 - g.x1;
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    rock.push([g.x1 + u * w, g.y + 1 + (r() - 0.5) * 2.5]);
  }
  const under = [];
  for (let i = 16; i >= 0; i--) {
    const u = i / 16;
    const depth = 30 + 120 * Math.pow(Math.sin(u * Math.PI), 0.7) * (0.75 + r() * 0.35);
    under.push([g.x1 + u * w + (u < 0.5 ? 1 : -1) * (1 - Math.abs(u - 0.5) * 2) * 10, g.y + depth]);
  }
  const streaks = [];
  for (let i = 0; i < 26; i++) {
    const x = g.x1 + 10 + r() * (w - 20);
    const y0 = g.y + 6 + r() * 20;
    streaks.push([x, y0, x + (r() - 0.5) * 10, y0 + 18 + r() * 60, 0.15 + r() * 0.35]);
  }
  const plat = stage.platforms.map((p, i) => {
    const rr = rng(100 + i);
    const holes = [];
    for (let k = 0; k < 8; k++) holes.push([p.x1 + 6 + rr() * (p.x2 - p.x1 - 12), rr() * 6 + 2, 8 + rr() * 22]);
    return { p, holes };
  });
  const mountains = [
    { pts: ridge(3, 40, 330, 210, 0.6), a: 0.1, par: 0.04 },
    { pts: ridge(5, 40, 380, 170, 0.7), a: 0.16, par: 0.08 },
    { pts: ridge(11, 40, 440, 120, 0.8), a: 0.24, par: 0.14 },
  ];
  const grass = [];
  for (let i = 0; i < 18; i++) grass.push([g.x1 + 8 + r() * (w - 16), 4 + r() * 8]);
  return { kind: "riverbank", key: keyOf(stage), stage, rock, under, streaks, plat, mountains, grass };
}

// Screen-space backdrop (logical 960x540), drawn before the camera transform.
export function drawBackdrop(ctx, cam, time, W = 960) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, 540);
  // soft paper vignette
  const vg = ctx.createRadialGradient(W / 2, 270, 200, W / 2, 270, 620 + (W - 960) / 2);
  vg.addColorStop(0, "rgba(255,252,240,0)");
  vg.addColorStop(1, "rgba(150,130,90,0.16)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, 540);
  // pale moon
  const pine = cache && cache.kind === "pinecliff";
  ctx.fillStyle = "rgba(31,27,22,0.06)";
  ctx.beginPath();
  if (pine) ctx.arc(W * 0.2 - cam.x * 0.02, 150 - cam.y * 0.01, 30, 0, Math.PI * 2);
  else ctx.arc(W * 0.73 - cam.x * 0.02, 120 - cam.y * 0.01, 46, 0, Math.PI * 2);
  ctx.fill();
  if (!cache) return;
  for (const m of cache.mountains) {
    const n = m.pts.length - 1;
    const off = -cam.x * m.par - 40;
    ctx.fillStyle = `rgba(31,27,22,${m.a})`;
    ctx.beginPath();
    ctx.moveTo(-60, 560);
    for (let i = 0; i <= n; i++) ctx.lineTo(off + (i / n) * (W + 140), m.pts[i] - cam.y * m.par * 0.5 - 40);
    ctx.lineTo(W + 140, 560);
    ctx.closePath();
    ctx.fill();
    // mist band under each ridge
    const my = 400 - cam.y * m.par * 0.5;
    const mg = ctx.createLinearGradient(0, my - 60, 0, my + 20);
    mg.addColorStop(0, "rgba(243,239,228,0)");
    mg.addColorStop(1, "rgba(243,239,228,0.5)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, my - 60, W, 80);
  }
}

// World-space stage.
export function drawStage(ctx, stage) {
  if (!cache || cache.key !== keyOf(stage)) cache = build(stage);
  if (cache.kind === "pinecliff") return drawPine(ctx, cache);
  const c = cache;
  const g = stage.ground;
  ctx.save();
  // rock body
  ctx.fillStyle = "#2b2620";
  ctx.beginPath();
  ctx.moveTo(c.rock[0][0], c.rock[0][1]);
  for (const p of c.rock) ctx.lineTo(p[0], p[1]);
  for (const p of c.under) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
  // dry-brush streaks (paper showing through)
  ctx.lineCap = "round";
  for (const s of c.streaks) {
    ctx.strokeStyle = `rgba(243,239,228,${s[4] * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    ctx.lineTo(s[2], s[3]);
    ctx.stroke();
  }
  // wet top edge
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(g.x1 - 2, g.y + 1);
  ctx.lineTo(g.x2 + 2, g.y + 1);
  ctx.stroke();
  // grass ticks
  ctx.lineWidth = 2;
  for (const t of c.grass) {
    ctx.beginPath();
    ctx.moveTo(t[0], g.y);
    ctx.lineTo(t[0] + 1.5, g.y - t[1]);
    ctx.stroke();
  }
  // platforms: one loaded stroke each
  for (const { p, holes } of c.plat) {
    const th = 11;
    ctx.fillStyle = "#26211b";
    ctx.beginPath();
    ctx.moveTo(p.x1 - 6, p.y + 2);
    ctx.lineTo(p.x1 + 6, p.y);
    ctx.lineTo(p.x2 - 6, p.y);
    ctx.quadraticCurveTo(p.x2 + 10, p.y + 1, p.x2 + 2, p.y + th * 0.6);
    ctx.quadraticCurveTo(p.x2 - 30, p.y + th, (p.x1 + p.x2) / 2, p.y + th * 0.8);
    ctx.quadraticCurveTo(p.x1 + 20, p.y + th * 0.9, p.x1 - 6, p.y + 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(243,239,228,0.45)";
    ctx.lineWidth = 1.2;
    for (const h of holes) {
      ctx.beginPath();
      ctx.moveTo(h[0], p.y + h[1]);
      ctx.lineTo(h[0] + h[2], p.y + h[1] + 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}


// ---- Pine cliff: a tall cliff, a leaning pine whose branches are the platforms ----

function buildPine(stage) {
  const g = stage.ground;
  const r = rng(21);
  const w = g.x2 - g.x1;
  // jagged cliff walls going down out of sight
  const left = [];
  const right = [];
  for (let i = 0; i <= 14; i++) {
    const y = g.y + i * 36;
    left.push([g.x1 + 4 + Math.sin(i * 0.9) * 8 + (r() - 0.5) * 12 + i * 1.5, y]);
    right.push([g.x2 - 4 + Math.sin(i * 1.3 + 2) * 8 + (r() - 0.5) * 12 - i * 1.5, y]);
  }
  const streaks = [];
  for (let i = 0; i < 40; i++) {
    const x = g.x1 + 14 + r() * (w - 28);
    const y0 = g.y + 8 + r() * 300;
    streaks.push([x, y0, x + (r() - 0.5) * 5, y0 + 30 + r() * 90, 0.12 + r() * 0.3]);
  }
  // trunk: a lean from the cliff's left shoulder up past the high branch
  const trunk = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = -150 + 80 * u + Math.sin(u * 5) * 6;
    const y = 4 - 190 * u;
    trunk.push([x, y, 24 - 14 * u]);
  }
  const bark = [];
  for (let i = 0; i < 16; i++) {
    const u = r() * 0.9;
    const t = trunk[Math.floor(u * N)];
    bark.push([t[0] + (r() - 0.5) * t[2] * 0.7, t[1], 10 + r() * 20]);
  }
  const tufts = [];
  const add = (cx, cy, rad, n) => {
    const lines = [];
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * (0.05 + 0.9 * r());
      const len = rad * (0.5 + 0.6 * r());
      lines.push([Math.cos(a) * 2, Math.sin(a) * 2, Math.cos(a) * len, Math.sin(a) * len * 0.7]);
    }
    tufts.push({ cx, cy, lines });
  };
  // needle clusters: crown at the trunk head, along the long branch, and on the stub
  add(-60, -185, 46, 34);
  add(-150, -105, 26, 16);
  for (const p of stage.platforms) {
    const len = p.x2 - p.x1;
    const n = Math.max(2, Math.round(len / 55));
    for (let i = 0; i < n; i++) add(p.x1 + (len * (i + 0.7)) / (n + 0.3), p.y - 8 - r() * 10, 30 + r() * 14, 22);
  }
  const mountains = [
    { pts: ridge(31, 36, 300, 300, 1.1), a: 0.09, par: 0.03 },
    { pts: ridge(37, 36, 380, 250, 1.0), a: 0.15, par: 0.07 },
    { pts: ridge(41, 36, 460, 190, 1.0), a: 0.22, par: 0.12 },
  ];
  return { kind: "pinecliff", key: keyOf(stage), stage, left, right, streaks, trunk, bark, tufts, mountains };
}

function drawPine(ctx, c) {
  const stage = c.stage;
  const g = stage.ground;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // cliff body
  ctx.fillStyle = "#2b2620";
  ctx.beginPath();
  ctx.moveTo(g.x1 - 2, g.y + 1);
  ctx.lineTo(g.x2 + 2, g.y + 1);
  for (const p of c.right) ctx.lineTo(p[0], p[1]);
  for (let i = c.left.length - 1; i >= 0; i--) ctx.lineTo(c.left[i][0], c.left[i][1]);
  ctx.closePath();
  ctx.fill();
  for (const s of c.streaks) {
    ctx.strokeStyle = `rgba(243,239,228,${s[4] * 0.5})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    ctx.lineTo(s[2], s[3]);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(g.x1 - 2, g.y + 1);
  ctx.lineTo(g.x2 + 2, g.y + 1);
  ctx.stroke();
  // mist swallowing the foot of the cliff
  const mg = ctx.createLinearGradient(0, 70, 0, 260);
  mg.addColorStop(0, "rgba(243,239,228,0)");
  mg.addColorStop(0.6, "rgba(243,239,228,0.8)");
  mg.addColorStop(1, "rgba(243,239,228,0.95)");
  ctx.fillStyle = mg;
  ctx.fillRect(-900, 70, 1800, 600);
  // trunk: tapered brush stroke
  const t = c.trunk;
  ctx.fillStyle = "#26211b";
  ctx.beginPath();
  for (let i = 0; i < t.length; i++) ctx.lineTo(t[i][0] - t[i][2] / 2, t[i][1]);
  for (let i = t.length - 1; i >= 0; i--) ctx.lineTo(t[i][0] + t[i][2] / 2, t[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(243,239,228,0.35)";
  ctx.lineWidth = 1.2;
  for (const b of c.bark) {
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(b[0] + 1, b[1] - b[2]);
    ctx.stroke();
  }
  // branches are the platforms: thick at the trunk, thin at the tip, top edge on the surface
  for (const p of stage.platforms) {
    const fromLeft = p.x1 > -100; // long branch leaves the trunk at its left end
    const thick = 13;
    const rootX = fromLeft ? p.x1 : p.x2;
    const tipX = fromLeft ? p.x2 : p.x1;
    ctx.fillStyle = "#26211b";
    ctx.beginPath();
    ctx.moveTo(rootX, p.y);
    ctx.lineTo(tipX, p.y + 1);
    ctx.quadraticCurveTo(tipX + (fromLeft ? 6 : -6), p.y + 5, tipX, p.y + 5);
    ctx.quadraticCurveTo((rootX + tipX) / 2, p.y + thick * 0.55, rootX, p.y + thick);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(243,239,228,0.4)";
    ctx.lineWidth = 1.1;
    for (let k = 0; k < 5; k++) {
      const x = p.x1 + 8 + ((k * 37) % Math.max(10, p.x2 - p.x1 - 16));
      ctx.beginPath();
      ctx.moveTo(x, p.y + 3 + (k % 3));
      ctx.lineTo(x + 14, p.y + 3.5 + (k % 3));
      ctx.stroke();
    }
  }
  // needle clusters, in ink at two strengths
  ctx.strokeStyle = INK;
  for (let i = 0; i < c.tufts.length; i++) {
    const tf = c.tufts[i];
    ctx.save();
    ctx.translate(tf.cx, tf.cy);
    ctx.globalAlpha = i % 2 ? 0.55 : 0.85;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const l of tf.lines) {
      ctx.moveTo(l[0], l[1]);
      ctx.lineTo(l[2], l[3]);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
