// Entry point: wires the socket, input, renderer and DOM overlay together.

import { Net } from "./net.js";
import { Renderer } from "./render.js";
import { Input, isTouchDevice } from "./input.js";
import { UI } from "./ui.js";
import { Sfx } from "./audio.js";

const canvas = document.getElementById("game");
const uiRoot = document.getElementById("ui");
const touchRoot = document.getElementById("touch");
const touch = isTouchDevice();
if (touch) document.body.classList.add("touch");

const renderer = new Renderer(canvas);
renderer.touchHud = touch;
const sfx = new Sfx();
let lastCount = 0;
let lastLeft = 0;
const input = new Input(touchRoot);
let welcome = null;
let lobby = null;
let phase = "lobby";
let wantReplay = false; // a replay was asked for and has not ended
let replaying = false;

function setReplaying(on) {
  if (replaying === on) return;
  replaying = on;
  net.replaying = on;
  net.clear();
  renderer.reset();
  ui.setReplay(on);
}

function endReplay() {
  wantReplay = false;
  setReplaying(false);
}

const net = new Net({
  open: () => {
    ui.setStatus("");
    ui.hideBlocked();
  },
  close: (final) => {
    if (!final) ui.setStatus("Connection lost. Reconnecting...");
  },
  error: (m) => {
    const again = () => {
      ui.hideBlocked();
      ui.setStatus("Connecting...");
      net.reconnect();
    };
    if (m.code === "replaced") ui.showBlocked("This seal is playing in another tab.", "Play here", again);
    else if (m.code === "room_full") ui.showBlocked("This room is full.", "Try again", again);
    else if (m.code === "rooms_full") ui.showBlocked("Every scroll is in use right now. Try again in a moment.", "Try again", again);
    else ui.showBlocked(m.message || "Could not join this room.", "Try again", again);
  },
  reset: () => renderer.reset(),
  welcome: (w) => {
    welcome = w;
    net.mySlot = w.slot;
    renderer.setStage(w.stage);
    if (location.pathname.toLowerCase() !== "/r/" + w.room.toLowerCase()) history.replaceState(null, "", "/r/" + w.room);
    document.body.dataset.room = w.room;
    ui.setWelcome(w);
    if (lobby) ui.setLobby(lobby);
  },
  snap: (m) => {
    if (m.replay) {
      if (!wantReplay) return false; // stale, after Stop
      setReplaying(true);
    } else if (replaying) {
      endReplay(); // a real match took over
    }
  },
  replayEnd: () => endReplay(),
  lobby: (l) => {
    const prev = phase;
    if (l.phase !== "lobby" && l.phase !== prev && replaying) endReplay();
    lobby = l;
    phase = l.phase;
    if (welcome && l.you !== undefined) welcome.slot = net.mySlot = l.you;
    input.guest = l.youGuest != null;
    if (phase === "lobby" && prev !== "lobby" && !replaying) {
      net.clear();
      renderer.reset();
    }
    if (l.stageDef) renderer.setStage(l.stageDef);
    ui.setLobby(l);
  },
  end: (e) => {
    phase = "results";
    sfx.play("end");
    ui.showResults(e);
  },
});

const ui = new UI(
  uiRoot,
  {
    pick: (fighter) => net.send({ t: "pick", fighter }),
    pick1: (fighter) => net.send({ t: "pick", fighter, p: 1 }),
    guest: (add) => net.send({ t: "guest", add }),
    stage: (id) => net.send({ t: "stage", id }),
    ready: (ready) => net.send({ t: "ready", ready }),
    cpu: (add) => net.send({ t: "cpu", add }),
    replay: (go) => {
      wantReplay = go;
      if (go) net.send({ t: "replay" });
      else {
        net.send({ t: "replay", stop: true });
        endReplay();
      }
    },
  },
  touch,
);
ui.setStatus("Connecting...");
net.connect();

// Lobby backdrop: the players standing on the stage, no snapshot needed.
function lobbyView() {
  if (!lobby || !welcome) return null;
  const sp = renderer.stage.spawns;
  const fighters = lobby.players.map((p) => ({
    slot: p.slot,
    fighter: p.fighter,
    glyph: p.glyph,
    x: sp[p.slot]?.x ?? 0,
    y: sp[p.slot]?.y ?? 0,
    vx: 0,
    vy: 0,
    facing: (sp[p.slot]?.x ?? 0) <= 0 ? 1 : -1,
    action: "idle",
    frame: 0,
    damage: 0,
    stocks: 3,
    invuln: false,
    shield: 100,
    hitstun: false,
    hitstop: false,
    absent: !p.present,
    graceLeft: 0,
    out: false,
    cpu: p.cpu,
  }));
  return { tick: performance.now() / 16.67, phase: "lobby", countdown: 0, fighters, projectiles: [] };
}

let lastSend = 0;
let fpsFrames = 0;
let fpsT0 = 0;
let lastFrame = 0;
let worst = 0;
window.__fps = 0;
window.__worstFrameMs = 0;
window.__client = { net, renderer, input, get phase() { return phase; } };

function frame(now) {
  if (lastFrame) worst = Math.max(worst, now - lastFrame);
  lastFrame = now;
  if (!fpsT0) fpsT0 = now;
  fpsFrames++;
  if (now - fpsT0 >= 1000) {
    window.__fps = Math.round((fpsFrames * 1000) / (now - fpsT0));
    window.__worstFrameMs = Math.round(worst);
    fpsFrames = 0;
    fpsT0 = now;
    worst = 0;
  }

  const inMatch = !replaying && phase === "match" && welcome && welcome.slot != null;
  input.setActive(inMatch);
  let view;
  if (phase === "lobby" && !replaying) {
    view = lobbyView();
  } else {
    view = net.view(now);
    if (view) {
      for (const ev of net.drainEvents(view.tick)) {
        renderer.event(ev, view, now);
        sfx.event(ev);
      }
      const n = view.phase === "countdown" ? Math.ceil(view.countdown / 40) : 0;
      if (n && n !== lastCount) sfx.play("tick");
      lastCount = n;
      const left = view.phase === "fight" && Number.isFinite(view.timeLeft) ? Math.ceil(view.timeLeft / 60) : 0;
      if (left >= 1 && left <= 5 && left !== lastLeft) sfx.play("tick");
      lastLeft = left;
    }
  }
  renderer.draw(view, now, { showHud: phase !== "lobby" || replaying, lobby: phase === "lobby" && !replaying });

  if (inMatch && now - lastSend >= 15) {
    lastSend = now;
    net.sendInput(input.poll(0));
    if (input.guest) net.sendInput(input.poll(1), 1);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Portrait phones: ask for landscape (shown by CSS on touch devices only).
{
  const r = document.createElement("div");
  r.id = "rotate";
  const g = document.createElement("div");
  g.className = "rot-glyph";
  g.textContent = "⟳";
  const t = document.createElement("p");
  t.textContent = "Rotate your phone. 墨鬥 is played in landscape.";
  r.append(g, t);
  document.body.append(r);
}

// Mute toggle, remembered across visits.
{
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mute";
  const paint = () => {
    b.textContent = sfx.muted ? "音 off" : "音 on";
    b.setAttribute("aria-pressed", String(sfx.muted));
    b.setAttribute("aria-label", sfx.muted ? "Sound off, press to turn on" : "Sound on, press to mute");
  };
  b.onclick = () => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    paint();
  };
  paint();
  uiRoot.append(b);
}
