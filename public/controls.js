// The controls reference, derived from the maps input.js actually reads, so
// the list can't drift from the bindings. Pure data: ui.js draws it.

import { MENU_KEY, P1, P1_ARROWS, P2, PAD, TOUCH_BUTTONS } from "./input.js";

const KEY_LABEL = {
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Comma: "comma",
  Period: "full stop",
  Slash: "slash",
  ShiftRight: "right Shift",
  Escape: "Esc",
};
// Standard-layout names (Xbox lettering, the one printed on most pads).
const PAD_LABEL = { 0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 9: "Start", 12: "d-pad up", 13: "d-pad down", 14: "d-pad left", 15: "d-pad right" };

export const keyLabel = (code) => KEY_LABEL[code] ?? code.replace(/^Key/, "");
// "a, b or c"
const orList = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1]);
const keys = (...lists) => orList([...new Set(lists.flat().filter(Boolean))].map(keyLabel));
const pads = (list) => orList(list.map((i) => PAD_LABEL[i]));
const touchCap = (name) => {
  const t = TOUCH_BUTTONS.find((b) => b.name === name);
  return `${t.glyph} (${t.cap})`;
};

const L = {
  move: "Move",
  jump: "Jump (again in the air)",
  down: "Fast-fall, drop through",
  attack: "Attack (+ direction: strong)",
  special: "Ink, your special",
  shield: "Shield",
  menu: "Pause menu (in a match)",
};

function keyRows(maps) {
  const m = (name) => maps.map((x) => x[name]);
  const move = maps.map((x) => `${keyLabel(x.left[0])} ${keyLabel(x.right[0])}`).join(" or ");
  return [
    [L.move, move],
    [L.jump, keys(...m("jump"))],
    [L.down, keys(...m("down"))],
    [L.attack, keys(...m("attack"))],
    [L.special, keys(...m("special"))],
    [L.shield, keys(...m("shield"))],
  ];
}

/**
 * Sections to show for this device and seat.
 * touch: the on-screen controls are showing; keyboard: a fine pointer exists;
 * guest: a local second player is seated; pad: a gamepad is connected.
 */
export function controlsFor({ touch, keyboard, guest, pad }) {
  const out = [];
  if (touch) {
    out.push({
      title: "Touch",
      rows: [
        [L.move, "drag, left thumb"],
        [L.jump, touchCap("jump")],
        [L.down, "drag down"],
        ["Attack (+ drag: strong)", touchCap("attack")],
        [L.special, touchCap("special")],
        [L.shield, touchCap("shield")],
        [L.menu, "Menu, top right"],
      ],
    });
  }
  if (keyboard) {
    const you = { title: guest ? "Keyboard, player 1 (you)" : "Keyboard", rows: keyRows(guest ? [P1] : [P1, P1_ARROWS]) };
    you.rows.push([L.menu, keyLabel(MENU_KEY)]);
    out.push(you);
    if (guest) out.push({ title: "Keyboard, player 2 (guest)", rows: keyRows([P2]) });
  }
  if (pad || keyboard) {
    out.push({
      title: guest ? "Gamepad (first pad: player 1, second pad: player 2)" : "Gamepad",
      rows: [
        [L.move, "left stick or d-pad"],
        [L.jump, pads(PAD.jump)],
        [L.down, "stick or d-pad down"],
        [L.attack, pads(PAD.attack)],
        [L.special, pads(PAD.special)],
        [L.shield, pads(PAD.shield)],
        [L.menu, pads(PAD.menu)],
      ],
    });
  }
  return out;
}
