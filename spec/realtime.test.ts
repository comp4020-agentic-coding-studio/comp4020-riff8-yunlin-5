import { afterEach, expect, inject, it } from "vitest";
import { Clients, startMatch, uniqueRoom, type Msg } from "./helpers/ws.ts";

const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

const fighterOf = (snap: Msg, slot: number) => snap.fighters.find((f: Msg) => f.slot === slot);

it("A's input shows up in B's snapshots within 1000 ms", async () => {
  const room = uniqueRoom();
  const { c: a, welcome: wa } = await clients.join(room);
  const { c: b } = await clients.join(room);
  expect(wa.slot).not.toBeNull();
  await startMatch(a, b);

  // Let A settle, take a baseline from B's most recent snap, then hold right.
  const baseline = [...b.msgs].reverse().find((m) => m.t === "snap")!;
  const x0 = fighterOf(baseline, wa.slot).x;
  const markB = b.mark();
  const start = performance.now();
  let seq = 0;
  const timer = setInterval(() => a.send({ t: "input", seq: seq++, b: 0, x: 100, y: 0 }), 16);
  try {
    const moved = await b.waitFor(
      (m) => m.t === "snap" && Math.abs(fighterOf(m, wa.slot).x - x0) > 1,
      1000,
      markB,
    );
    const elapsed = performance.now() - start;
    expect(moved.t).toBe("snap");
    expect(elapsed).toBeLessThan(1000);
  } finally {
    clearInterval(timer);
  }
});

it("snapshots carry the fields the client draws", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room);
  const { c: b } = await clients.join(room);
  await startMatch(a, b);
  const snap = [...b.msgs].reverse().find((m) => m.t === "snap")!;
  expect(snap.fighters).toHaveLength(2);
  for (const f of snap.fighters) {
    for (const k of ["slot", "fighter", "glyph", "x", "y", "action", "damage", "stocks", "absent", "graceLeft", "out"]) {
      expect(f, `fighter missing ${k}`).toHaveProperty(k);
    }
    expect(f.absent).toBe(false);
  }
});

it("a third joiner during a match is a spectator", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room);
  const { c: b } = await clients.join(room);
  await startMatch(a, b);
  const { welcome } = await clients.join(room);
  expect(welcome.slot).toBeNull();
});
