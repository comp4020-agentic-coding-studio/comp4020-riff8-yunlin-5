// DOM overlay: lobby, fighter select, results, status. Text is set with
// textContent only; nothing from the wire is ever parsed as HTML.

import { drawFighter, FIGHTER_INFO } from "./art/fighters.js";
import { SLOT_COLOURS } from "./render.js";

// Line sketches for the stage picker: ground and platforms in world units.
const SKETCH = {
  riverbank: { g: [-320, 320], p: [[-230, -90, -110], [90, 230, -110], [-70, 70, -210]] },
  pinecliff: { g: [-230, 230], p: [[-230, -120, -80], [-40, 230, -150]] },
};
const IDS = ["brush", "carver", "blot", "wanderer"];

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function seal(glyph, slot, cls = "") {
  const s = h("span", "seal " + cls, glyph || "?");
  s.style.background = SLOT_COLOURS[slot] || "#1f1b16";
  return s;
}

export class UI {
  constructor(root, on, isTouch) {
    this.root = root;
    this.on = on;
    this.isTouch = isTouch;
    this.welcome = null;
    this.lobby = null;
    this.phase = "lobby";
    this.pickFor = 0; // 0 = picking for you, 1 = for the guest
    this.hasKeyboard = !isTouch || matchMedia("(any-pointer: fine)").matches; // hidden on touch-only devices
    this.mode = "none"; // lobby | match | results | none
    this.build();
  }

  build() {
    const r = this.root;
    r.textContent = "";
    this.status = h("div", "status");
    this.status.hidden = true;

    // lobby panel
    const p = (this.lobbyEl = h("section", "panel lobby"));
    p.hidden = true;
    p.append(h("h1", "title", "墨鬥"), h("p", "sub", "Ink Contest. Up to four on one scroll."));
    const roomRow = h("div", "room-row");
    this.codeEl = h("span", "code", "----");
    this.linkEl = h("input", "link");
    this.linkEl.readOnly = true;
    this.linkEl.setAttribute("aria-label", "Room link");
    this.copyBtn = h("button", "btn", "Copy link");
    this.copyBtn.type = "button";
    this.copyBtn.onclick = () => this.copyLink();
    roomRow.append(h("span", "label", "Room"), this.codeEl, this.linkEl, this.copyBtn);
    p.append(roomRow);

    this.playersEl = h("ul", "players");
    p.append(this.playersEl);

    this.pickForRow = h("div", "pickfor");
    this.pickForRow.hidden = true;
    this.pickForBtns = [h("button", "btn small", "Picking for: you"), h("button", "btn small", "Picking for: guest")];
    this.pickForBtns.forEach((b, i) => {
      b.type = "button";
      b.onclick = () => {
        this.pickFor = i;
        if (this.lobby) this.drawLobby(this.lobby, this.welcome?.slot == null);
      };
      this.pickForRow.append(b);
    });
    p.append(this.pickForRow);
    this.pickEl = h("div", "picks");
    this.cards = {};
    for (const id of IDS) {
      const card = h("button", "card");
      card.type = "button";
      const cv = h("canvas", "card-art");
      cv.width = 96;
      cv.height = 96;
      const nm = h("span", "card-name");
      const bl = h("span", "card-blurb");
      card.append(cv, nm, bl);
      card.onclick = () => (this.pickFor === 1 ? this.on.pick1(id) : this.on.pick(id));
      this.cards[id] = { card, cv, nm, bl };
      this.pickEl.append(card);
    }
    p.append(this.pickEl);

    this.stageRow = h("div", "stages");
    this.stageRow.hidden = true;
    this.stageBtns = {};
    p.append(this.stageRow);

    const row = h("div", "btn-row");
    this.readyBtn = h("button", "btn primary", "Ready");
    this.readyBtn.type = "button";
    this.readyBtn.onclick = () => this.on.ready(!this.myReady());
    this.addCpu = h("button", "btn", "Add CPU");
    this.addCpu.type = "button";
    this.addCpu.onclick = () => this.on.cpu(true);
    this.remCpu = h("button", "btn", "Remove CPU");
    this.remCpu.type = "button";
    this.remCpu.onclick = () => this.on.cpu(false);
    this.guestBtn = h("button", "btn", "Add a second player here");
    this.guestBtn.type = "button";
    this.guestBtn.onclick = () => this.on.guest(!this.guest());
    row.append(this.readyBtn, this.addCpu, this.remCpu, this.guestBtn);
    p.append(row);
    this.noteEl = h("p", "note");
    p.append(this.noteEl);
    this.helpEl = h(
      "p",
      "help",
      this.isTouch
        ? "Left thumb: move. Right thumb: jump, attack, ink, shield."
        : "Move A D or arrows. Jump W, Up or Space. Attack J. Ink K. Shield L. Down drops through a stroke. A gamepad works too: stick or d-pad, A jump, X attack, B ink, bumpers shield.",
    );
    p.append(this.helpEl);

    // results panel
    this.resultsEl = h("section", "panel results");
    this.resultsEl.hidden = true;

    // small in-match badge
    this.badge = h("div", "badge");
    this.badge.hidden = true;

    // quiet full-screen notice with one button (replaced seat, room full)
    this.blockedEl = h("div", "blocked");
    this.blockedEl.hidden = true;
    const bp = h("section", "panel blocked-panel");
    this.blockedText = h("p", "blocked-text");
    this.blockedBtn = h("button", "btn primary");
    this.blockedBtn.type = "button";
    bp.append(this.blockedText, this.blockedBtn);
    this.blockedEl.append(bp);

    r.append(this.status, this.lobbyEl, this.resultsEl, this.badge, this.blockedEl);
  }

  showBlocked(text, label, onClick) {
    this.blockedText.textContent = text;
    this.blockedBtn.textContent = label;
    this.blockedBtn.onclick = onClick;
    this.status.hidden = true;
    this.blockedEl.hidden = false;
    this.blockedBtn.focus();
  }

  hideBlocked() {
    this.blockedEl.hidden = true;
  }

  setStatus(text) {
    this.status.hidden = !text;
    this.status.textContent = text || "";
  }

  fighterName(id) {
    const f = this.welcome?.fighters?.find((x) => x.id === id);
    return f?.name || FIGHTER_INFO[id]?.name || id;
  }

  setWelcome(w) {
    this.welcome = w;
    this.linkEl.value = location.origin + "/r/" + w.room;
    this.codeEl.textContent = w.room;
    for (const id of IDS) {
      this.cards[id].nm.textContent = this.fighterName(id);
      this.cards[id].bl.textContent = FIGHTER_INFO[id]?.blurb || "";
    }
    this.refresh();
  }

  me() {
    const s = this.welcome?.slot;
    return s == null ? null : this.lobby?.players?.find((p) => p.slot === s) || null;
  }
  guest() {
    const g = this.lobby?.youGuest;
    return g == null ? null : this.lobby.players.find((p) => p.slot === g) || null;
  }
  myReady() {
    return !!this.me()?.ready;
  }

  setLobby(l) {
    this.lobby = l;
    this.phase = l.phase;
    this.refresh();
  }

  copyLink() {
    const done = () => {
      this.copyBtn.textContent = "Copied";
      setTimeout(() => (this.copyBtn.textContent = "Copy link"), 1500);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(this.linkEl.value).then(done, () => this.fallbackCopy(done));
    else this.fallbackCopy(done);
  }
  fallbackCopy(done) {
    this.linkEl.select();
    try {
      document.execCommand("copy");
      done();
    } catch {}
  }

  refresh() {
    const l = this.lobby;
    if (!l || !this.welcome) return;
    const spectator = this.welcome.slot == null;
    const phase = l.phase;
    this.lobbyEl.hidden = phase !== "lobby";
    if (phase !== "results") this.resultsEl.hidden = true;
    this.badge.hidden = phase !== "match";
    if (phase === "match") {
      this.badge.textContent = (spectator ? "Watching. " : "") + "Room " + l.room;
    }
    if (phase === "lobby") this.drawLobby(l, spectator);
  }

  drawLobby(l, spectator) {
    const me = this.me();
    this.playersEl.textContent = "";
    for (let slot = 0; slot < 4; slot++) {
      const p = l.players.find((x) => x.slot === slot);
      const li = h("li", "player" + (p ? "" : " empty") + (p && p.slot === this.welcome.slot ? " me" : ""));
      if (p) {
        li.append(seal(p.glyph, slot), h("span", "pname", this.fighterName(p.fighter)));
        const tag = p.cpu ? "CPU" : !p.present ? "away" : p.ready ? "ready" : "choosing";
        const t = h("span", "ptag " + (p.ready ? "ok" : ""), tag);
        li.append(t);
        if (p.slot === this.welcome.slot) li.append(h("span", "you", "you"));
        else if (p.slot === l.youGuest) li.append(h("span", "you", "you (2)"));
        else if (p.guest) li.append(h("span", "you", "guest"));
      } else {
        li.append(h("span", "seal ghost", "·"), h("span", "pname", "open"));
      }
      this.playersEl.append(li);
    }
    const gp = this.guest();
    if (!gp) this.pickFor = 0;
    this.pickForRow.hidden = !gp;
    this.pickForBtns.forEach((b, i) => b.classList.toggle("on", i === this.pickFor));
    const target = this.pickFor === 1 && gp ? gp : me;
    const mine = target?.fighter;
    for (const id of IDS) {
      const c = this.cards[id];
      c.card.classList.toggle("on", id === mine);
      c.card.disabled = spectator;
      this.paintCard(c.cv, id, target ? target.slot : 0);
    }
    // a second keyboard player: only where there is a keyboard and a seat to give
    this.guestBtn.hidden = spectator || !this.hasKeyboard || (!gp && l.players.length >= 4);
    this.guestBtn.textContent = gp ? "Remove second player" : "Add a second player here";
    this.helpEl.textContent = this.helpText(!!gp);
    this.drawStages(l, spectator);
    this.readyBtn.disabled = spectator;
    this.readyBtn.textContent = me?.ready ? "Not ready" : "Ready";
    this.readyBtn.classList.toggle("on", !!me?.ready);
    const cpus = l.players.filter((p) => p.cpu).length;
    this.addCpu.disabled = l.players.length >= 4;
    this.remCpu.disabled = cpus === 0;
    const n = l.players.length;
    let note = "";
    if (spectator) note = "You are watching. You will take a place when one opens.";
    else if (n < 2) note = "Share the link, or add a CPU, to start.";
    else if (!me?.ready) note = "Pick a fighter and press Ready.";
    else note = "Waiting for everyone to be ready.";
    if (l.spectators) note += ` ${l.spectators} watching.`;
    this.noteEl.textContent = note;
  }

  drawStages(l, spectator) {
    const list = l.stages;
    if (!Array.isArray(list) || list.length < 2) {
      this.stageRow.hidden = true;
      return;
    }
    this.stageRow.hidden = false;
    for (const st of list) {
      let b = this.stageBtns[st.id];
      if (!b) {
        const card = h("button", "stage-card");
        card.type = "button";
        const cv = h("canvas", "stage-art");
        cv.width = 120;
        cv.height = 56;
        const nm = h("span", "card-name", st.name);
        card.append(cv, nm);
        card.onclick = () => this.on.stage(st.id);
        this.paintStage(cv, st.id);
        this.stageRow.append(card);
        b = this.stageBtns[st.id] = card;
      }
      b.classList.toggle("on", st.id === l.stage);
      b.disabled = spectator;
    }
  }

  paintStage(cv, id) {
    const sk = SKETCH[id];
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 120, 56);
    ctx.strokeStyle = "#1f1b16";
    ctx.fillStyle = "#1f1b16";
    ctx.lineCap = "round";
    const sc = 0.17;
    const X = (x) => 60 + x * sc;
    const Y = (y) => 40 + y * sc;
    if (!sk) {
      ctx.fillRect(20, 40, 80, 4);
      return;
    }
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X(sk.g[0]), Y(0));
    ctx.lineTo(X(sk.g[1]), Y(0));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(sk.g[0]) + 2, Y(0));
    ctx.lineTo(X(sk.g[0] + 40), Y(0) + 12);
    ctx.lineTo(X(sk.g[1] - 40), Y(0) + 12);
    ctx.lineTo(X(sk.g[1]) - 2, Y(0));
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    for (const [a, b, y] of sk.p) {
      ctx.beginPath();
      ctx.moveTo(X(a), Y(y));
      ctx.lineTo(X(b), Y(y));
      ctx.stroke();
    }
  }

  helpText(guest) {
    if (this.isTouch) return "Left thumb: move. Right thumb: jump, attack, ink, shield.";
    if (guest)
      return "Player 1: A D move, W or Space jump, S drops, J attack, K ink, L shield. Player 2: arrows move, Up jumps, comma attack, full stop ink, slash or right Shift shield. Gamepads: the first pad is player 1, the second is player 2.";
    return "Move A D or arrows. Jump W, Up or Space. Attack J. Ink K. Shield L. Down drops through a stroke. A gamepad works too: stick or d-pad, A jump, X attack, B ink, bumpers shield.";
  }

  paintCard(cv, id, slot) {
    const key = id + slot;
    if (cv.dataset.k === key) return;
    cv.dataset.k = key;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 96, 96);
    ctx.save();
    ctx.translate(48, 90);
    ctx.scale(0.8, 0.8);
    drawFighter(ctx, { action: "idle", frame: 0, vy: 0, shield: 100, slot, fighter: id }, { ink: SLOT_COLOURS[slot], time: 0 });
    ctx.restore();
  }

  showResults(end) {
    const el = this.resultsEl;
    el.textContent = "";
    this.lobbyEl.hidden = true;
    this.badge.hidden = true;
    const mySlot = this.welcome?.slot;
    const win = end.results.find((r) => r.slot === end.winner);
    el.append(h("h1", "title", win ? "勝" : "和"));
    el.append(h("p", "sub", win ? "takes the scroll" : "A draw. The ink dries."));
    if (win) {
      const row = h("div", "winner");
      row.append(seal(win.glyph, win.slot, "big"), h("span", "pname", this.fighterName(win.fighter)));
      el.append(row);
    }
    const t = h("table", "table");
    const head = h("tr");
    for (const c of ["", "", "", "KOs", "Falls", "Dealt"]) head.append(h("th", "", c));
    t.append(head);
    const sorted = [...end.results].sort((a, b) => a.placement - b.placement);
    for (const r of sorted) {
      const tr = h("tr", r.slot === mySlot ? "me" : "");
      tr.append(h("td", "", String(r.placement)));
      const td = h("td");
      td.append(seal(r.glyph, r.slot));
      tr.append(td, h("td", "", this.fighterName(r.fighter)), h("td", "", String(r.kos)), h("td", "", String(r.falls)), h("td", "", String(Math.round(r.damageDealt))));
      t.append(tr);
    }
    el.append(t);
    el.append(h("p", "note", "Back to the lobby in a moment."));
    el.hidden = false;
  }
}
