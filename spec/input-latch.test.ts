import { afterEach, expect, inject, it } from "vitest";
import { Clients, sleep, startMatch, uniqueRoom } from "./helpers/ws.ts";

const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

// A tap whose press and release both land inside one 16 ms tick (common on
// phones) must still register: the server ORs every button seen since the last tick.
it("an attack press released in the same JS turn still starts a jab or strong", async () => {
  const room = uniqueRoom();
  const { c: a, welcome } = await clients.join(room);
  const { c: b } = await clients.join(room);
  await startMatch(a, b);
  await sleep(100);

  const mark = b.mark();
  a.send({ t: "input", seq: 1, b: 2, x: 0, y: 0 });
  a.send({ t: "input", seq: 2, b: 0, x: 0, y: 0 });
  const snap = await b.waitFor(
    (m) =>
      m.t === "snap" &&
      ["jab", "strong"].includes(m.fighters.find((f: any) => f.slot === welcome.slot)?.action),
    300,
    mark,
  );
  expect(snap.t).toBe("snap");
});
