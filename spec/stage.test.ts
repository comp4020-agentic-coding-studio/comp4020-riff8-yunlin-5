import { afterEach, expect, inject, it } from "vitest";
import { Clients, startMatch, uniqueRoom } from "./helpers/ws.ts";

const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

it("a seated player picks the stage, and the match is played on it", async () => {
  const room = uniqueRoom();
  const { c: a, welcome } = await clients.join(room);
  const { c: b } = await clients.join(room);
  expect(welcome.stage.id).toBe("riverbank");

  const mark = a.mark();
  a.send({ t: "stage", id: "pinecliff" });
  const lobby = await a.waitFor((m) => m.t === "lobby" && m.stage === "pinecliff", 3000, mark);
  expect(lobby.stageDef.id).toBe("pinecliff");
  expect(lobby.stages.map((s: any) => s.id)).toEqual(["riverbank", "pinecliff"]);

  const mb = b.mark();
  await startMatch(a, b);
  const snap = await b.waitFor((m) => m.t === "snap", 3000, mb);
  const xs = snap.fighters.map((f: any) => Math.abs(f.x)).sort((p: number, q: number) => p - q);
  // pinecliff spawns are at +-150 for slots 0 and 1 (riverbank's are +-200)
  expect(xs.every((x: number) => x <= 160)).toBe(true);
});

it("an unknown stage id closes the socket", async () => {
  const { c } = await clients.join(uniqueRoom());
  c.send({ t: "stage", id: "nowhere" });
  expect(await c.waitClosed()).toBe(1008);
});
