import { afterEach, expect, inject, it } from "vitest";
import { Clients, getSeal, sleep, startMatch, uniqueRoom } from "./helpers/ws.ts";

const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

// D5: a seal that already holds a seat takes it over from any older socket, so a
// phone switching networks (leaving a half-open socket) never locks itself out.
it("a second socket with the same seal takes over the seat and the first is closed with 4000", async () => {
  const room = uniqueRoom();
  const sealA = await getSeal(baseUrl);
  const sealB = await getSeal(baseUrl);
  const { c: a1, welcome: wa } = await clients.join(room, sealA.cookie);
  const { c: b } = await clients.join(room, sealB.cookie);
  await startMatch(a1, b);

  const { c: a2, welcome: wa2 } = await clients.join(room, sealA.cookie);
  const err = await a1.waitType("error");
  expect(err.code).toBe("replaced");
  expect(await a1.waitClosed()).toBe(4000);
  expect(wa2.slot).toBe(wa.slot);
  expect(wa2.rejoined).toBe(true);

  const mark = b.mark();
  let seq = 0;
  for (let i = 0; i < 30; i++) {
    a2.send({ t: "input", seq: seq++, b: 0, x: 100, y: 0 });
    await sleep(16);
  }
  const xs = b.msgs
    .slice(mark)
    .filter((m) => m.t === "snap")
    .map((m) => m.fighters.find((f: any) => f.slot === wa.slot)?.x as number);
  expect(xs.length).toBeGreaterThan(2);
  expect(Math.abs(xs.at(-1)! - xs[0]!)).toBeGreaterThan(1);
});

// D6: two seals can collide on a glyph, which is hard to construct on purpose, so
// this checks the property it protects: a full room shows four distinct glyphs.
it("a room with four seated players shows four distinct glyphs", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room, (await getSeal(baseUrl)).cookie);
  await clients.join(room, (await getSeal(baseUrl)).cookie);
  const mark = a.mark();
  a.send({ t: "cpu", add: true });
  a.send({ t: "cpu", add: true });
  const lobby = await a.waitFor((m) => m.t === "lobby" && m.players.length === 4, 3000, mark);
  const glyphs = lobby.players.map((p: any) => p.glyph);
  expect(new Set(glyphs).size).toBe(4);
});
