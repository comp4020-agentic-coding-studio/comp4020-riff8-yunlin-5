// Keyboard and multi-touch -> { b, x, y } (b: JUMP 1, ATTACK 2, SPECIAL 4, SHIELD 8).

const BTN = { jump: 1, attack: 2, special: 4, shield: 8 };
const KEYS = {
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  KeyW: "jump", ArrowUp: "jump", Space: "jump",
  KeyS: "down", ArrowDown: "down",
  KeyJ: "attack", KeyK: "special", KeyL: "shield",
};

export const isTouchDevice = () =>
  /[?&]touch\b/.test(location.search) || matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

export class Input {
  constructor(touchRoot) {
    this.keys = new Set();
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
    this.keys.clear();
    for (const k in this.btnPointers) this.btnPointers[k].clear();
    this.stickId = null;
    this.stick = { x: 0, y: 0 };
    this.refreshTouchView();
  }

  key(e, down) {
    const a = KEYS[e.code];
    if (!a || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.active) e.preventDefault();
    if (down) this.keys.add(a);
    else this.keys.delete(a);
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
  pollPad() {
    const out = { b: 0, x: 0, y: 0 };
    let pads;
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      return out;
    }
    for (const p of pads) {
      if (!p || !p.connected) continue;
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

  poll() {
    const k = this.keys;
    let x = (k.has("right") ? 100 : 0) - (k.has("left") ? 100 : 0);
    let y = k.has("down") ? 100 : 0;
    let b = 0;
    if (k.has("jump")) b |= BTN.jump;
    if (k.has("attack")) b |= BTN.attack;
    if (k.has("special")) b |= BTN.special;
    if (k.has("shield")) b |= BTN.shield;
    for (const n in BTN) if (this.btnPointers[n].size) b |= BTN[n];
    const g = this.pollPad();
    b |= g.b;
    if (Math.abs(g.x) > Math.abs(x)) x = g.x;
    if (Math.abs(g.y) > Math.abs(y)) y = g.y;
    const s = this.stick;
    const mag = Math.hypot(s.x, s.y);
    if (mag > 0.2) {
      const sx = Math.round(Math.max(-1, Math.min(1, s.x)) * 100);
      const sy = Math.round(Math.max(-1, Math.min(1, s.y)) * 100);
      if (Math.abs(sx) > Math.abs(x)) x = sx;
      if (Math.abs(sy) > Math.abs(y)) y = sy;
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
