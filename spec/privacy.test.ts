import { afterEach, expect, inject, it } from "vitest";
import { Clients, getSeal, sleep, startMatch, uniqueRoom } from "./helpers/ws.ts";

// A seal token is the visitor's whole identity. It must never be broadcast.
const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

it("no server message ever contains a seal token", async () => {
  const sealA = await getSeal(baseUrl);
  const sealB = await getSeal(baseUrl);
  const room = uniqueRoom();
  const { c: a } = await clients.join(room, sealA.cookie);
  const { c: b } = await clients.join(room, sealB.cookie);
  await startMatch(a, b);
  for (let i = 0; i < 20; i++) a.send({ t: "input", seq: i, b: 1, x: 100, y: 0 });
  await sleep(500);

  expect(a.raw.length).toBeGreaterThan(5);
  for (const c of [a, b]) {
    for (const s of c.raw) {
      expect(s.includes(sealA.token), "message leaks A's token").toBe(false);
      expect(s.includes(sealB.token), "message leaks B's token").toBe(false);
    }
  }
});
