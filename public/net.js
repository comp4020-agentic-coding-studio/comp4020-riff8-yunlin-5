// WebSocket client, snapshot buffer and interpolation.
// The renderer asks for the world at "now - 2 snapshots" in server ticks.

const MS_PER_TICK = 1000 / 60;
const DELAY_TICKS = 4; // two snaps at 30 Hz
const LERP_FIELDS = ["x", "y", "vx", "vy", "shield"];

export class Net {
  constructor(on) {
    this.on = on;
    this.ws = null;
    this.room = null; // set from welcome; reused on reconnect
    this.snaps = [];
    this.off = 0;
    this.rtt = 0;
    this.pings = new Map();
    this.pingId = 0;
    this.seq = 0;
    this.closedForGood = false;
    this.retry = 0;
  }

  connect() {
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      const room = this.room || document.body.dataset.room || "";
      this.send(room ? { t: "join", room: room.toUpperCase() } : { t: "join" });
      this.pingTimer = setInterval(() => this.ping(), 2000);
      this.ping();
      this.on.open?.();
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handle(m);
    };
    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      if (ws !== this.ws) return; // an old socket closing after a manual reconnect
      if (e.code === 4000 && !this.closedForGood) {
        // another tab/device took this seal's seat: never fight for it automatically
        this.closedForGood = true;
        this.on.error?.({ code: "replaced" });
      }
      this.on.close?.(this.closedForGood);
      if (!this.closedForGood) {
        this.retry++;
        setTimeout(() => this.connect(), Math.min(5000, 800 * this.retry));
      }
    };
    ws.onerror = () => {};
  }

  // Manual reconnect (the "Play here" / "Try again" buttons).
  reconnect() {
    this.closedForGood = false;
    this.retry = 0;
    this.clear();
    try {
      this.ws?.close();
    } catch {}
    this.connect();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  sendInput(inp) {
    this.send({ t: "input", seq: this.seq++ & 0x3fffffff, b: inp.b, x: inp.x, y: inp.y });
  }

  ping() {
    const id = this.pingId++ & 0x3fffffff;
    this.pings.set(id, performance.now());
    if (this.pings.size > 8) this.pings.delete(this.pings.keys().next().value);
    this.send({ t: "ping", id });
  }

  handle(m) {
    switch (m.t) {
      case "welcome":
        this.room = m.room;
        this.on.welcome?.(m);
        break;
      case "lobby":
        this.on.lobby?.(m);
        break;
      case "snap":
        this.addSnap(m);
        break;
      case "end":
        this.on.end?.(m);
        break;
      case "pong": {
        const t0 = this.pings.get(m.id);
        if (t0 !== undefined) {
          this.pings.delete(m.id);
          const r = performance.now() - t0;
          this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r;
        }
        break;
      }
      case "error":
        this.closedForGood = true;
        this.on.error?.(m);
        break;
    }
  }

  addSnap(m) {
    const now = performance.now();
    const last = this.snaps[this.snaps.length - 1];
    if (last && m.tick < last.tick - 10) {
      this.snaps = []; // a new match restarted the tick clock
      this.on.reset?.();
    }
    if (last && m.tick <= last.tick && this.snaps.length) {
      if (m.tick === last.tick) return;
    }
    const sample = m.tick * MS_PER_TICK - now;
    if (!this.snaps.length) this.off = sample;
    else this.off += (sample - this.off) * (sample > this.off ? 0.5 : 0.05);
    m.fired = false;
    this.snaps.push(m);
    if (this.snaps.length > 40) this.snaps.shift();
  }

  clear() {
    this.snaps = [];
  }

  // The interpolated world to draw at wall time `now` (performance.now ms).
  view(now) {
    const s = this.snaps;
    if (!s.length) return null;
    let rt = (now + this.off) / MS_PER_TICK - DELAY_TICKS;
    const first = s[0].tick;
    const lastTick = s[s.length - 1].tick;
    rt = Math.max(first, Math.min(lastTick, rt));
    let i = s.length - 1;
    while (i > 0 && s[i - 1].tick >= rt) i--;
    // s[i-1].tick < rt <= s[i].tick, or i === 0
    const b = s[i];
    const a = i > 0 ? s[i - 1] : b;
    const span = b.tick - a.tick;
    const alpha = span > 0 ? Math.max(0, Math.min(1, (rt - a.tick) / span)) : 1;
    const fighters = [];
    for (const fb of b.fighters) {
      const fa = a.fighters.find((x) => x.slot === fb.slot);
      const f = { ...fb };
      if (
        fa &&
        fa.absent === fb.absent &&
        fa.out === fb.out &&
        Math.abs(fb.x - fa.x) < 160 &&
        Math.abs(fb.y - fa.y) < 160
      ) {
        for (const k of LERP_FIELDS) f[k] = fa[k] + (fb[k] - fa[k]) * alpha;
      }
      if (fa && alpha < 0.5) {
        f.action = fa.action;
        f.frame = fa.frame;
        f.facing = fa.facing;
      }
      fighters.push(f);
    }
    const projectiles = [];
    for (const pb of b.projectiles) {
      const pa = a.projectiles.find((x) => x.id === pb.id);
      projectiles.push(pa ? { ...pb, x: pa.x + (pb.x - pa.x) * alpha, y: pa.y + (pb.y - pa.y) * alpha } : pb);
    }
    const near = alpha < 0.5 ? a : b;
    return {
      tick: rt,
      phase: near.phase,
      countdown: near.countdown,
      fighters,
      projectiles,
    };
  }

  // Events from snaps whose tick the render clock has now passed.
  drainEvents(renderTick) {
    const out = [];
    for (const sn of this.snaps) {
      if (!sn.fired && sn.tick <= renderTick + 0.5) {
        sn.fired = true;
        if (sn.events) out.push(...sn.events);
      }
    }
    return out;
  }
}
