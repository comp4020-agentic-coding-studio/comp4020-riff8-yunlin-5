import { expect, inject, it } from "vitest";

// The in-game controls list (public/controls.js) is built from the same maps
// public/input.js reads, so it can't describe keys the game doesn't bind. These
// load the modules the running app actually serves, then check what a player is shown.
const baseUrl = inject("baseUrl");

async function load(): Promise<{ controls: any; input: any }> {
  // input.js only touches the DOM when an Input is constructed, so it imports cleanly here.
  const g = globalThis as any;
  g.location ??= new URL(baseUrl);
  const mod = async (name: string) => {
    const res = await fetch(new URL(`/public/${name}`, baseUrl));
    expect(res.status).toBe(200);
    return res.text();
  };
  const inputSrc = await mod("input.js");
  const inputUrl = "data:text/javascript;base64," + Buffer.from(inputSrc).toString("base64");
  const controlsSrc = (await mod("controls.js")).replace('"./input.js"', JSON.stringify(inputUrl));
  const input = await import(inputUrl);
  const controls = await import("data:text/javascript;base64," + Buffer.from(controlsSrc).toString("base64"));
  return { controls, input };
}

const rowsText = (sections: any[]) => sections.flatMap((s: any) => s.rows.map((r: string[]) => r.join(": "))).join("\n");

it("the pause key is not a game key, and the pad's menu button is not a game button", async () => {
  const { input } = await load();
  const gameKeys = new Set([...Object.values(input.P1), ...Object.values(input.P2), ...Object.values(input.P1_ARROWS)].flat());
  expect(gameKeys.has(input.MENU_KEY)).toBe(false);
  const gameButtons = Object.entries(input.PAD).filter(([k]) => k !== "menu").flatMap(([, v]) => v as number[]);
  for (const b of input.PAD.menu) expect(gameButtons).not.toContain(b);
});

it("the guest's keymap is shown only when a guest is seated", async () => {
  const { controls } = await load();
  const solo = controls.controlsFor({ touch: false, keyboard: true, guest: false, pad: false });
  const duo = controls.controlsFor({ touch: false, keyboard: true, guest: true, pad: false });
  expect(solo.map((s: any) => s.title).join("|")).not.toMatch(/guest|player 2/i);
  expect(duo.map((s: any) => s.title).join("|")).toMatch(/player 2/);
  // With a guest, the arrows belong to player 2 and must not be listed for player 1.
  const p1 = duo.find((s: any) => /player 1/.test(s.title));
  expect(rowsText([p1])).not.toMatch(/[←→↑↓]/);
  expect(rowsText([solo[0]])).toMatch(/←/);
});

it("touch-only devices see the on-screen buttons by their real captions, and no keyboard", async () => {
  const { controls, input } = await load();
  const s = controls.controlsFor({ touch: true, keyboard: false, guest: false, pad: false });
  expect(s.map((x: any) => x.title)).toEqual(["Touch"]);
  const text = rowsText(s);
  for (const b of input.TOUCH_BUTTONS) expect(text).toContain(`${b.glyph} (${b.cap})`);
});

it("every bound key appears in the list", async () => {
  const { controls, input } = await load();
  const solo = rowsText(controls.controlsFor({ touch: false, keyboard: true, guest: false, pad: false }));
  const duo = rowsText(controls.controlsFor({ touch: false, keyboard: true, guest: true, pad: false }));
  for (const code of [...Object.values(input.P1), ...Object.values(input.P1_ARROWS)].flat() as string[]) {
    expect(solo).toContain(controls.keyLabel(code));
  }
  for (const code of Object.values(input.P2).flat() as string[]) expect(duo).toContain(controls.keyLabel(code));
  expect(solo).toContain("Esc");
});
