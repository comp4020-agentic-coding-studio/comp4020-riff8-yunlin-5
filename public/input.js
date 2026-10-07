// Keyboard and multi-touch -> { b, x, y } (b: JUMP 1, ATTACK 2, SPECIAL 4, SHIELD 8).

const BTN = { jump: 1, attack: 2, special: 4, shield: 8 };
// Raw key codes each player uses. Without a guest the arrows also drive P1.
const P1 = { left: ["KeyA"], right: ["KeyD"], jump: ["KeyW", "Space"], down: ["KeyS"], attack: ["KeyJ"], special: ["KeyK"], shield: ["KeyL"] };
const P1_ARROWS = { left: ["ArrowLeft"], right: ["ArrowRight"], jump: ["ArrowUp"], down: ["ArrowDown"] };
const P2 = {
  left: ["ArrowLeft"], right: ["ArrowRight"], jump: ["ArrowUp"], down: ["ArrowDown"],
  attack: ["Comma"], special: ["Period"], shield: ["Slash", "ShiftRight"],
};
const KNOWN = new Set([...Object.values(P1), ...Object.values(P2)].flat());

export const isTouchDevice = () =>
  /[?&]touch\b/.test(location.search) || matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

export class Input {
  constructor(touchRoot) {
    this.codes = new Set();
    this.guest = false; // set by game.js while a second local player is seated
    this.active = false;
    this.touchRoot = touchRoot;
    this.btnPointers = { jump: new Set(), attack: new Set(), special: new Set(), shield: new Set() };
    this.stickId = null;
    this.stick = { x: 0, y: 0 };
    this.base = { x: 0, y: 0 };
    this.touchEnabled = isTouchDevice();
    addEventListener("keydown", (e) => this.key(e, true));
    addEventListener("keyup", (e) => this.key(e, false));
    addEventListener("blur", () => this.releaseAll());
    document.addEventListener("visibilitychange", () => document.hidden && this.releaseAll());
    if (this.touchEnabled) this.buildTouch();
  }

  setActive(on) {
    this.active = on;
    if (!on) this.releaseAll();
    if (this.touchRoot) this.touchRoot.classList.toggle("on", on && this.touchEnabled);
  }

  releaseAll() {
    this.codes.clear();
    for (const k in this.btnPointers) this.btnPointers[k].clear();
    this.stickId = null;
    this.stick = { x: 0, y: 0 };
    this.refreshTouchView();
  }

  key(e, down) {
    if (!KNOWN.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.active) e.preventDefault();
    if (down) this.codes.add(e.code);
    else this.codes.delete(e.code);
  }

  // Held keys for one player as { left, right, down, jump, attack, special, shield }.
  keysFor(player) {
    const maps = player === 1 ? [P2] : this.guest ? [P1] : [P1, P1_ARROWS];
    const out = {};
    for (const name of ["left", "right", "down", "jump", "attack", "special", "shield"]) {
      out[name] = maps.some((m) => (m[name] || []).some((c) => this.codes.has(c)));
    }
    return out;
  }

  buildTouch() {
    const root = this.touchRoot;
    root.innerHTML = "";
    const zone = el("div", "stick-zone");
    this.base_el = el("div", "stick-base");
    this.knob_el = el("div", "stick-knob");
    this.base_el.appendChild(this.knob_el);
    const pad = el("div", "btn-pad");
    const mk = (name, label) => {
      const b = el("button", "tbtn tbtn-" + name);
      b.type = "button";
      b.textContent = label;
      b.setAttribute("aria-label", name);
      const set = this.btnPointers[name];
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        capture(b, e);
        set.add(e.pointerId);
        this.refreshTouchView();
      });
      const up = (e) => {
        set.delete(e.pointerId);
        this.refreshTouchView();
      };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      pad.appendChild(b);
      return b;
    };
    this.btnEls = {
      shield: mk("shield", "盾"),
      special: mk("special", "墨"),
      attack: mk("attack", "擊"),
      jump: mk("jump", "躍"),
    };
    root.append(zone, this.base_el, pad);
    zone.addEventListener("pointerdown", (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      capture(zone, e);
      this.stickId = e.pointerId;
      this.base = { x: e.clientX, y: e.clientY };
      this.stick = { x: 0, y: 0 };
      this.radius = Math.max(40, Math.min(70, innerHeight * 0.14));
      this.refreshTouchView();
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.base.x;
      let dy = e.clientY - this.base.y;
      const d = Math.hypot(dx, dy);
      if (d > this.radius) {
        // drag the base along so the thumb never leaves the stick
        const over = d - this.radius;
        this.base.x += (dx / d) * over;
        this.base.y += (dy / d) * over;
        dx = e.clientX - this.base.x;
        dy = e.clientY - this.base.y;
      }
      this.stick = { x: dx / this.radius, y: dy / this.radius };
      this.refreshTouchView();
    });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stick = { x: 0, y: 0 };
      this.refreshTouchView();
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
    zone.addEventListener("lostpointercapture", end);
    zone.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  refreshTouchView() {
    if (!this.touchEnabled || !this.base_el) return;
    const on = this.stickId !== null;
    this.base_el.classList.toggle("down", on);
    if (on) {
      this.base_el.style.left = this.base.x + "px";
      this.base_el.style.top = this.base.y + "px";
      this.knob_el.style.transform = `translate(${this.stick.x * this.radius}px, ${this.stick.y * this.radius}px)`;
    }
    for (const k in this.btnEls) this.btnEls[k].classList.toggle("held", this.btnPointers[k].size > 0);
  }

  // First connected pad wins; no pad (or no Gamepad API) is simply no input.
  pollPad(which = 0) {
    const out = { b: 0, x: 0, y: 0 };
    let pads;
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      return out;
    }
    // P1 uses the first connected pad; the guest uses the second (and nothing if there is only one)
    const live = [...(pads ?? [])].filter((p) => p && p.connected);
    for (const p of live.slice(which, which + 1)) {
      const bt = (i) => !!p.buttons[i]?.pressed;
      let ax = p.axes[0] || 0;
      let ay = p.axes[1] || 0;
      const mag = Math.hypot(ax, ay);
      if (mag < 0.25) {
        ax = 0;
        ay = 0;
      } else {
        // rescale so the live range starts at the deadzone edge
        const k = (Math.min(1, mag) - 0.25) / 0.75 / mag;
        ax *= k;
        ay *= k;
      }
      let x = Math.round(Math.max(-1, Math.min(1, ax)) * 100);
      let y = Math.round(Math.max(-1, Math.min(1, ay)) * 100);
      if (bt(14)) x = -100;
      if (bt(15)) x = 100;
      if (bt(13)) y = 100;
      out.x = x;
      out.y = y;
      if (bt(0) || bt(3) || bt(12)) out.b |= BTN.jump;
      if (bt(2)) out.b |= BTN.attack;
      if (bt(1)) out.b |= BTN.special;
      if (bt(4) || bt(5) || bt(6) || bt(7)) out.b |= BTN.shield;
      break;
    }
    return out;
  }

  poll(player = 0) {
    const k = this.keysFor(player);
    let x = (k.right ? 100 : 0) - (k.left ? 100 : 0);
    let y = k.down ? 100 : 0;
    let b = 0;
    if (k.jump) b |= BTN.jump;
    if (k.attack) b |= BTN.attack;
    if (k.special) b |= BTN.special;
    if (k.shield) b |= BTN.shield;
    const g = this.pollPad(player);
    b |= g.b;
    if (Math.abs(g.x) > Math.abs(x)) x = g.x;
    if (Math.abs(g.y) > Math.abs(y)) y = g.y;
    if (player === 0) {
      for (const n in BTN) if (this.btnPointers[n].size) b |= BTN[n];
      const s = this.stick;
      if (Math.hypot(s.x, s.y) > 0.2) {
        const sx = Math.round(Math.max(-1, Math.min(1, s.x)) * 100);
        const sy = Math.round(Math.max(-1, Math.min(1, s.y)) * 100);
        if (Math.abs(sx) > Math.abs(x)) x = sx;
        if (Math.abs(sy) > Math.abs(y)) y = sy;
      }
    }
    return { b, x, y };
  }
}

function el(tag, cls) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function capture(node, e) {
  try {
    node.setPointerCapture(e.pointerId);
  } catch {
    // no active pointer (synthetic event): tracking by pointerId still works
  }
}
