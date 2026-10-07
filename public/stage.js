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
function build(stage) {
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
  return { stage, rock, under, streaks, plat, mountains, grass };
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
  ctx.fillStyle = "rgba(31,27,22,0.06)";
  ctx.beginPath();
  ctx.arc(W * 0.73 - cam.x * 0.02, 120 - cam.y * 0.01, 46, 0, Math.PI * 2);
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
  if (!cache || cache.stage !== stage) cache = build(stage);
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
