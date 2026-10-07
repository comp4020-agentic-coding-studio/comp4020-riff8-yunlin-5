import { afterEach, expect, inject, it } from "vitest";
import { Clients, startMatch, uniqueRoom } from "./helpers/ws.ts";

const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

it("snaps carry an items array and an inked flag on every fighter", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room);
  const { c: b } = await clients.join(room);
  await startMatch(a, b);
  const snap = await a.waitFor((m) => m.t === "snap" && m.phase === "fight");
  expect(Array.isArray(snap.items)).toBe(true);
  for (const f of snap.fighters) expect(typeof f.inked).toBe("boolean");
});

// ITEM_INTERVAL is 900 +- 180 ticks (12-18 s): an ink pot shows up in a quiet fight.
it("an ink pot appears in the snaps during a fight", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room);
  const { c: b } = await clients.join(room);
  await startMatch(a, b);
  const snap = await a.waitFor((m) => m.t === "snap" && m.items.length > 0, 22000);
  const item = snap.items[0];
  expect(item.kind).toBe("inkpot");
  expect(Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isInteger(item.id)).toBe(true);
}, 30000);
