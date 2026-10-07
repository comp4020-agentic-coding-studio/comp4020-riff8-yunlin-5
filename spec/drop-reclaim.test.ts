import { afterEach, expect, inject, it } from "vitest";
import { Clients, getSeal, sleep, startMatch, uniqueRoom, type Msg } from "./helpers/ws.ts";

// The decision (decisions.md D1): a dropped player gets a 15 s grace; their
// fighter is absent, not gone; the same seal reclaims the slot with damage and
// stocks kept.
const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

const fighterOf = (snap: Msg, slot: number) => snap.fighters.find((f: Msg) => f.slot === slot);

it("a dropped fighter is absent, not out; the same seal reclaims the slot", async () => {
  const sealA = await getSeal(baseUrl);
  const sealB = await getSeal(baseUrl);
  const room = uniqueRoom();
  const { c: a } = await clients.join(room, sealA.cookie);
  const { c: b, welcome: wb } = await clients.join(room, sealB.cookie);
  expect(wb.slot).not.toBeNull();
  await startMatch(a, b);

  // Take B's last snap before the drop as the reference.
  const before = [...a.msgs].reverse().find((m) => m.t === "snap" && m.phase === "fight")!;
  const fb = fighterOf(before, wb.slot);
  expect(fb.absent).toBe(false);

  b.close();
  await b.waitClosed();
  const mark = a.mark();
  const absentSnap = await a.waitFor(
    (m) => m.t === "snap" && fighterOf(m, wb.slot)?.absent === true,
    2000,
    mark,
  );
  expect(fighterOf(absentSnap, wb.slot).graceLeft).toBeGreaterThan(0);
  expect(fighterOf(absentSnap, wb.slot).out).toBe(false);

  // The match must not end while B is in grace.
  await sleep(1000);
  expect(a.msgs.slice(mark).some((m) => m.t === "end")).toBe(false);
  const lobbyDuring = a.msgs.slice(mark).filter((m) => m.t === "lobby").pop();
  if (lobbyDuring) {
    expect(lobbyDuring.players.find((p: Msg) => p.slot === wb.slot)?.present).toBe(false);
  }

  const lastAbsent = [...a.msgs].reverse().find((m) => m.t === "snap")!;
  const stocksBefore = fighterOf(lastAbsent, wb.slot).stocks;
  const damageBefore = fighterOf(lastAbsent, wb.slot).damage;

  const { c: b2, welcome: wb2 } = await clients.join(room, sealB.cookie);
  expect(wb2.slot).toBe(wb.slot);
  expect(wb2.rejoined).toBe(true);

  const back = await a.waitFor(
    (m) => m.t === "snap" && fighterOf(m, wb.slot)?.absent === false,
    3000,
    a.mark() - 1,
  );
  expect(fighterOf(back, wb.slot).stocks).toBe(stocksBefore);
  expect(fighterOf(back, wb.slot).damage).toBe(damageBefore);
  expect(fighterOf(back, wb.slot).graceLeft).toBe(0);
  // B's new socket receives the match too.
  await b2.waitFor((m) => m.t === "snap", 2000);
});
