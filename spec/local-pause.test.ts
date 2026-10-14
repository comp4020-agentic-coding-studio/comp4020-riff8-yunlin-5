import { afterEach, expect, inject, it } from "vitest";
import { Clients, sleep, startMatch, uniqueRoom, type Msg } from "./helpers/ws.ts";

// The pause menu is local (public/game.js): while it's open that screen sends
// no input, and nothing new goes over the wire. That's only safe if the server
// already treats a silent-but-connected player the right way: the match keeps
// running for everyone, the fighter stays on stage (not absent, so no grace and
// no invincible ghost), a held button doesn't stay held, and input resumes cleanly.
const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

const fighterOf = (snap: Msg, slot: number) => snap.fighters.find((f: Msg) => f.slot === slot);
const lastSnap = (msgs: Msg[]) => [...msgs].reverse().find((m) => m.t === "snap")!;

it("a player who stops sending input stays on stage while the match runs on, and resumes cleanly", async () => {
  const room = uniqueRoom();
  const { c: a, welcome: wa } = await clients.join(room);
  const { c: b } = await clients.join(room);
  await startMatch(a, b);

  // A holds right, then goes silent without releasing (the worst case: the menu
  // sends a release first, but a lost frame must not leave the fighter running).
  a.send({ t: "input", seq: 1, b: 0, x: 100, y: 0 });
  await sleep(200);
  const tickBefore = lastSnap(b.msgs).tick;
  await sleep(1500);

  const during = lastSnap(b.msgs);
  expect(during.phase).toBe("fight");
  expect(during.tick - tickBefore).toBeGreaterThan(60); // the sim never stopped for B
  const fa = fighterOf(during, wa.slot);
  expect(fa.absent).toBe(false);
  expect(fa.graceLeft).toBe(0);
  expect(Math.abs(fa.vx)).toBeLessThan(0.5); // the stale held input has expired
  expect(a.closed).toBe(false);
  const xPaused = fa.x;

  // Resume: input flows again and moves the fighter.
  for (let i = 0; i < 20; i++) {
    a.send({ t: "input", seq: 2 + i, b: 0, x: -100, y: 0 });
    await sleep(15);
  }
  await sleep(100);
  const after = fighterOf(lastSnap(b.msgs), wa.slot);
  expect(after.x).toBeLessThan(xPaused - 5);
});
