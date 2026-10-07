import { afterEach, expect, inject, it } from "vitest";
import { Clients, getSeal, sleep, startMatch, uniqueRoom, type Client } from "./helpers/ws.ts";

const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

// One socket can seat a local guest (two players on one keyboard). The guest's
// seat is keyed by `${token}#guest` on the server and that never goes on the wire.
async function xOver(observer: Client, slot: number, send: () => void, ms = 500): Promise<number> {
  const mark = observer.mark();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    send();
    await sleep(16);
  }
  const xs = observer.msgs
    .slice(mark)
    .filter((m) => m.t === "snap")
    .map((m) => m.fighters.find((f: any) => f.slot === slot)?.x as number);
  return Math.abs(xs.at(-1)! - xs[0]!);
}

it("a guest takes its own seat, picks its own fighter, and p routes input to the right fighter", async () => {
  const room = uniqueRoom();
  const seal = await getSeal(baseUrl);
  const { c: a } = await clients.join(room, seal.cookie);
  const { c: b } = await clients.join(room, (await getSeal(baseUrl)).cookie);

  const mark = a.mark();
  a.send({ t: "guest", add: true });
  a.send({ t: "pick", fighter: "blot", p: 1 });
  const lobby = await a.waitFor(
    (m) => m.t === "lobby" && m.youGuest !== null && m.players.some((p: any) => p.guest && p.fighter === "blot"),
    3000,
    mark,
  );
  expect(lobby.players.length).toBe(3);
  const mine = lobby.players.filter((p: any) => p.slot === lobby.you || p.slot === lobby.youGuest);
  expect(mine.length).toBe(2);
  expect(new Set(lobby.players.map((p: any) => p.glyph)).size).toBe(3);
  expect(lobby.players.find((p: any) => p.slot === lobby.youGuest).guest).toBe(true);

  // Readying the owner readies the guest; B readies too and the match starts.
  await startMatch(a, b);
  const own = lobby.you as number;
  const guest = lobby.youGuest as number;
  let seq = 0;

  const guestMoved = await xOver(b, guest, () => a.send({ t: "input", seq: seq++, p: 1, b: 0, x: 100, y: 0 }));
  expect(guestMoved).toBeGreaterThan(1);
  // while the owner stood still
  const ownMoved = await xOver(b, own, () => a.send({ t: "input", seq: seq++, p: 0, b: 0, x: 100, y: 0 }));
  expect(ownMoved).toBeGreaterThan(1);

  for (const raw of b.raw) {
    expect(raw).not.toContain(seal.token);
    expect(raw).not.toContain("#guest");
  }
  for (const raw of a.raw) {
    expect(raw).not.toContain(seal.token);
    expect(raw).not.toContain("#guest");
  }
});

it("p:1 without a guest is ignored and removing the guest frees its seat", async () => {
  const { c: a } = await clients.join(uniqueRoom());
  const mark = a.mark();
  a.send({ t: "guest", add: true });
  await a.waitFor((m) => m.t === "lobby" && m.youGuest !== null, 3000, mark);
  const m2 = a.mark();
  a.send({ t: "guest", add: false });
  const lobby = await a.waitFor((m) => m.t === "lobby" && m.youGuest === null, 3000, m2);
  expect(lobby.players.length).toBe(1);
  a.send({ t: "input", seq: 0, p: 1, b: 0, x: 0, y: 0 });
  a.send({ t: "ping", id: 7 });
  await a.waitType("pong");
  expect(a.closed).toBe(false);
  a.send({ t: "input", seq: 1, p: 2, b: 0, x: 0, y: 0 });
  expect(await a.waitClosed()).toBe(1008);
});

it("a new socket with the same seal takes over both seats", async () => {
  const room = uniqueRoom();
  const seal = await getSeal(baseUrl);
  const { c: a1 } = await clients.join(room, seal.cookie);
  const mark = a1.mark();
  a1.send({ t: "guest", add: true });
  const before = await a1.waitFor((m) => m.t === "lobby" && m.youGuest !== null, 3000, mark);
  const { c: a2, welcome } = await clients.join(room, seal.cookie);
  expect(await a1.waitClosed()).toBe(4000);
  expect(welcome.slot).toBe(before.you);
  const after = await a2.waitFor((m) => m.t === "lobby" && m.youGuest === before.youGuest);
  expect(after.players.length).toBe(2);
});
