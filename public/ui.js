// DOM overlay: lobby, fighter select, results, status. Text is set with
// textContent only; nothing from the wire is ever parsed as HTML.

import { drawFighter, FIGHTER_INFO } from "./art/fighters.js";
import { SLOT_COLOURS } from "./render.js";

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
      card.onclick = () => this.on.pick(id);
      this.cards[id] = { card, cv, nm, bl };
      this.pickEl.append(card);
    }
    p.append(this.pickEl);

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
    row.append(this.readyBtn, this.addCpu, this.remCpu);
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
      } else {
        li.append(h("span", "seal ghost", "·"), h("span", "pname", "open"));
      }
      this.playersEl.append(li);
    }
    const mine = me?.fighter;
    for (const id of IDS) {
      const c = this.cards[id];
      c.card.classList.toggle("on", id === mine);
      c.card.disabled = spectator;
      this.paintCard(c.cv, id, me ? me.slot : 0);
    }
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
