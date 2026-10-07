// Canvas renderer: letterboxed 960x540 logical space, camera, stage, fighters,
// projectiles, particles, HUD. Pure drawing; game.js owns the state.

import { drawBackdrop, drawStage } from "./stage.js";
import { drawFighter } from "./art/fighters.js";

export const W = 960;
export const H = 540;
export const SLOT_COLOURS = ["#b5332e", "#2e4a7d", "#3c6b4a", "#a8741f"];
const INK = "#1f1b16";
const PAPER = "#f3efe4";
const SERIF = '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", Georgia, "Times New Roman", serif';

const DEFAULT_STAGE = {
  ground: { x1: -320, x2: 320, y: 0 },
  platforms: [
    { x1: -230, x2: -90, y: -110 },
    { x1: 90, x2: 230, y: -110 },
    { x1: -70, x2: 70, y: -210 },
  ],
  blast: { left: -820, right: 820, top: -720, bottom: 420 },
  spawns: [],
  respawn: { x: 0, y: -320 },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.stage = DEFAULT_STAGE;
    this.cam = { x: 0, y: -110, zoom: 1 };
    this.particles = [];
    this.marks = [];
    this.shake = 0;
    this.flash = 0;
    this.freezeUntil = 0;
    this.lastView = null;
    this.banner = null; // {text, until}
    this.lastNow = 0;
    this.resize();
    addEventListener("resize", () => this.resize());
    addEventListener("orientationchange", () => setTimeout(() => this.resize(), 150));
  }

  resize() {
    const vw = innerWidth;
    const vh = innerHeight;
    const s = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * s);
    const ch = Math.floor(H * s);
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    const c = this.canvas;
    c.style.width = cw + "px";
    c.style.height = ch + "px";
    c.style.left = Math.floor((vw - cw) / 2) + "px";
    c.style.top = Math.floor((vh - ch) / 2) + "px";
    c.width = Math.max(1, Math.round(cw * dpr));
    c.height = Math.max(1, Math.round(ch * dpr));
    this.scale = c.width / W;
  }

  setStage(s) {
    this.stage = s || DEFAULT_STAGE;
  }

  reset() {
    this.particles.length = 0;
    this.marks.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.lastView = null;
    this.cam = { x: 0, y: -110, zoom: 1 };
  }

  // ---- effects from sim events ----
  event(ev, view, now) {
    const col = (slot) => SLOT_COLOURS[slot] || INK;
    if (ev.type === "hit") {
      const kb = ev.kb || 0;
      const n = Math.min(44, 6 + Math.round(kb / 3));
      const speed = 1.5 + Math.min(10, kb / 8);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speed * (0.3 + Math.random());
        this.particles.push({
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 1,
          life: 0,
          max: 24 + Math.random() * 26,
          r: 1.5 + Math.random() * (2 + kb / 30),
          c: Math.random() < 0.3 ? col(ev.attacker) : INK,
        });
      }
      this.marks.push({ x: ev.x, y: ev.y, t: 0, size: 18 + Math.min(50, kb * 0.7), shield: ev.shielded });
      if (!ev.shielded && kb > 25) {
        this.shake = Math.max(this.shake, Math.min(12, kb / 9));
        if (kb > 40) this.freezeUntil = now + Math.min(90, 30 + kb * 0.5);
      }
    } else if (ev.type === "ko") {
      const p = this.clampToView(ev.x, ev.y);
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 9;
        this.particles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          max: 40 + Math.random() * 40,
          r: 2 + Math.random() * 5,
          c: Math.random() < 0.5 ? col(ev.slot) : INK,
        });
      }
      this.marks.push({ x: p.x, y: p.y, t: 0, size: 120, shield: false });
      this.flash = 0.55;
      this.shake = 14;
    } else if (ev.type === "start") {
      this.banner = { text: "墨鬥", until: now + 900 };
    } else if (ev.type === "respawn") {
      for (let i = 0; i < 10; i++)
        this.particles.push({
          x: ev.x + (Math.random() - 0.5) * 20,
          y: ev.y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 1.5,
          vy: Math.random() * 1.2,
          life: 0,
          max: 30,
          r: 2,
          c: col(ev.slot),
        });
    }
  }

  // world point -> nearest on-screen world point (for KOs past the blast edge)
  clampToView(x, y) {
    const c = this.cam;
    const hw = W / 2 / c.zoom - 30;
    const hh = H / 2 / c.zoom - 30;
    return {
      x: Math.max(c.x - hw, Math.min(c.x + hw, x)),
      y: Math.max(c.y - hh, Math.min(c.y + hh, y)),
    };
  }

  updateCamera(view, dt, lobby) {
    const live = view ? view.fighters.filter((f) => !f.out && !f.absent && f.action !== "dead") : [];
    let tx = 0;
    let ty = -120;
    let tz = 1.05;
    if (live.length) {
      let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
      for (const f of live) {
        x1 = Math.min(x1, f.x);
        x2 = Math.max(x2, f.x);
        y1 = Math.min(y1, f.y - 70);
        y2 = Math.max(y2, f.y);
      }
      // always keep a good slice of the stage in frame
      x1 = Math.min(x1, -250);
      x2 = Math.max(x2, 250);
      y1 = Math.min(y1, -230);
      y2 = Math.max(y2, 60);
      const w = x2 - x1 + 280;
      const h = y2 - y1 + 220;
      tz = Math.max(0.55, Math.min(1.15, Math.min(W / w, H / h)));
      tx = (x1 + x2) / 2;
      ty = (y1 + y2) / 2;
      // never let the camera leave the stage behind
      tx = Math.max(-450, Math.min(450, tx));
      ty = Math.max(-330, Math.min(-40, ty));
    }
    if (lobby) {
      // lobby: the stage sits to the right, clear of the panel
      const side = innerWidth >= 900 && innerHeight > 420;
      tz = side ? 0.8 : 1;
      tx = side ? -275 : 0;
      ty = side ? -110 : -120;
    }
    const k = 1 - Math.pow(0.001, dt / 1000); // ~ fast ease
    const c = this.cam;
    c.x += (tx - c.x) * Math.min(1, k * 0.9);
    c.y += (ty - c.y) * Math.min(1, k * 0.9);
    c.zoom += (tz - c.zoom) * Math.min(1, k * 0.7);
  }

  draw(view, now, info) {
    const ctx = this.ctx;
    const dt = Math.min(64, this.lastNow ? now - this.lastNow : 16);
    this.lastNow = now;
    const frozen = now < this.freezeUntil && this.lastView;
    if (frozen) view = this.lastView;
    else this.lastView = view;
    if (!frozen) this.updateCamera(view, dt, !!info.lobby);
    const sdt = frozen ? 0 : dt;

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    drawBackdrop(ctx, this.cam, now);

    // world
    let sx = 0, sy = 0;
    if (this.shake > 0.3) {
      sx = (Math.random() - 0.5) * this.shake * 2;
      sy = (Math.random() - 0.5) * this.shake * 2;
    }
    this.shake *= Math.pow(0.88, sdt / 16.7);
    const z = this.cam.zoom;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);
    drawStage(ctx, this.stage);
    if (view) {
      this.drawFighters(ctx, view, now);
      this.drawProjectiles(ctx, view, now);
    }
    this.drawParticles(ctx, sdt);
    ctx.restore();

    if (view) this.drawOffscreen(ctx, view);
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,252,240,${this.flash})`;
      ctx.fillRect(0, 0, W, H);
      this.flash *= Math.pow(0.9, sdt / 16.7);
    }
    if (view && info.showHud) this.drawHud(ctx, view);
    if (view && view.phase === "countdown" && view.countdown > 0) this.drawCountdown(ctx, view.countdown);
    if (this.banner) {
      if (now > this.banner.until) this.banner = null;
      else this.drawBanner(ctx, this.banner, now);
    }
  }

  drawFighters(ctx, view, now) {
    for (const f of view.fighters) {
      if (f.absent || f.out || f.action === "dead") continue;
      const ink = SLOT_COLOURS[f.slot] || INK;
      ctx.save();
      let jx = 0;
      if (f.hitstop) jx = (Math.random() - 0.5) * 3;
      ctx.translate(f.x + jx, f.y);
      if (f.invuln && Math.floor(now / 70) % 2) ctx.globalAlpha = 0.45;
      ctx.save();
      ctx.scale(f.facing || 1, 1);
      drawFighter(ctx, f, { ink, time: view.tick });
      ctx.restore();
      // seal tag over the head
      ctx.globalAlpha = 1;
      this.sealBox(ctx, -9, -96, 18, f.glyph, ink, 12);
      ctx.restore();
    }
  }

  sealBox(ctx, x, y, s, glyph, colour, font) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `bold ${font}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph || "", x + s / 2, y + s / 2 + 1);
  }

  drawProjectiles(ctx, view, now) {
    for (const p of view.projectiles) {
      const c = SLOT_COLOURS[p.owner] || INK;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      const t = now / 120 + p.id;
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * p.r * 1.35, p.y + Math.sin(a) * p.r * 1.35, p.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawParticles(ctx, dt) {
    const k = dt / 16.7;
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += k;
      if (p.life >= p.max) {
        ps.splice(i, 1);
        continue;
      }
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vy += 0.18 * k;
      p.vx *= Math.pow(0.97, k);
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 - 0.4 * (p.life / p.max)), 0, Math.PI * 2);
      ctx.fill();
    }
    const ms = this.marks;
    for (let i = ms.length - 1; i >= 0; i--) {
      const m = ms[i];
      m.t += k;
      if (m.t > 10) {
        ms.splice(i, 1);
        continue;
      }
      const u = m.t / 10;
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = m.shield ? "#6b665c" : INK;
      ctx.lineWidth = 3 * (1 - u) + 0.5;
      ctx.beginPath();
      for (let r = 0; r < 8; r++) {
        const a = (r * Math.PI) / 4 + 0.3;
        ctx.moveTo(m.x + Math.cos(a) * m.size * 0.3 * (0.4 + u), m.y + Math.sin(a) * m.size * 0.3 * (0.4 + u));
        ctx.lineTo(m.x + Math.cos(a) * m.size * (0.5 + u), m.y + Math.sin(a) * m.size * (0.5 + u));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Seal markers at the screen edge for fighters the camera clamp left out.
  drawOffscreen(ctx, view) {
    const c = this.cam;
    for (const f of view.fighters) {
      if (f.absent || f.out || f.action === "dead") continue;
      const px = W / 2 + (f.x - c.x) * c.zoom;
      const py = H / 2 + (f.y - 35 - c.y) * c.zoom;
      if (px > 0 && px < W && py > 0 && py < H) continue;
      const ex = Math.max(26, Math.min(W - 26, px));
      const ey = Math.max(26, Math.min(H - 26, py));
      ctx.globalAlpha = 0.85;
      this.sealBox(ctx, ex - 13, ey - 13, 26, f.glyph, SLOT_COLOURS[f.slot] || INK, 17);
      ctx.globalAlpha = 1;
    }
  }

  drawHud(ctx, view) {
    const fs = view.fighters.filter((f) => f);
    const n = fs.length;
    const bw = 190;
    const gap = Math.min(30, (W - 40 - n * bw) / Math.max(1, n - 1));
    const total = n * bw + (n - 1) * gap;
    let x = (W - total) / 2;
    const y = H - 70;
    for (const f of fs) {
      const col = SLOT_COLOURS[f.slot] || INK;
      ctx.save();
      const away = f.absent;
      ctx.globalAlpha = f.out ? 0.35 : away ? 0.4 : 1;
      // paper plate
      ctx.fillStyle = "rgba(243,239,228,0.78)";
      ctx.strokeStyle = "rgba(31,27,22,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, 60, 4);
      ctx.fill();
      ctx.stroke();
      this.sealBox(ctx, x + 8, y + 8, 44, f.glyph, col, 30);
      // damage
      const d = Math.round(f.damage);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const heat = Math.min(1, d / 150);
      ctx.fillStyle = heat > 0.5 ? mix(INK, "#b5332e", (heat - 0.5) * 2) : INK;
      ctx.font = `bold ${34 + heat * 6}px ${SERIF}`;
      ctx.fillText(f.out ? "out" : d + "%", x + 60, y + 38);
      // stocks
      for (let s = 0; s < f.stocks; s++) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x + 64 + s * 13, y + 50, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (f.cpu) {
        ctx.fillStyle = "#6b665c";
        ctx.font = `bold 11px ${SERIF}`;
        ctx.textAlign = "right";
        ctx.fillText("CPU", x + bw - 8, y + 16);
      }
      if (away) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = INK;
        ctx.font = `bold 22px ${SERIF}`;
        ctx.textAlign = "right";
        ctx.fillText(Math.ceil((f.graceLeft || 0) / 60) + "s", x + bw - 8, y + 40);
      }
      ctx.restore();
      x += bw + gap;
    }
  }

  drawCountdown(ctx, cd) {
    const n = Math.ceil(cd / 40);
    const u = 1 - (cd % 40 || 40) / 40;
    ctx.save();
    ctx.translate(W / 2, H / 2 - 30);
    ctx.scale(1 + u * 0.25, 1 + u * 0.25);
    ctx.globalAlpha = 1 - u * 0.6;
    ctx.fillStyle = INK;
    ctx.font = `bold 150px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  drawBanner(ctx, b, now) {
    const u = 1 - (b.until - now) / 900;
    ctx.save();
    ctx.translate(W / 2, H / 2 - 30);
    ctx.globalAlpha = Math.max(0, 1 - u * u);
    ctx.scale(1 + u * 0.3, 1 + u * 0.3);
    ctx.fillStyle = "#b5332e";
    ctx.font = `bold 130px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "rgb(" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",") + ")";
}
