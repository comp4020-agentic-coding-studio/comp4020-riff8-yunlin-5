import { afterEach, expect, inject, it } from "vitest";
import { Clients, type Msg } from "./helpers/ws.ts";

// Fills the shared server's rooms, so it runs alone (see vitest.config.ts).
const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

it("the room cap: rooms_full arrives, and a new room works once sockets leave", async () => {
  const opened: Awaited<ReturnType<typeof clients.join>>["c"][] = [];
  let full: Msg | null = null;
  for (let i = 0; i < 60 && !full; i++) {
    const c = await clients.connect();
    c.send({ t: "join" });
    const m = await c.waitFor((x) => x.t === "welcome" || x.t === "error");
    if (m.t === "error") full = m;
    else opened.push(c);
  }
  expect(full, "no rooms_full within 60 room creations").not.toBeNull();
  expect(full!.code).toBe("rooms_full");

  for (const c of opened) c.close();
  await Promise.all(opened.map((c) => c.waitClosed()));
  // Rooms with zero sockets are evicted when a create hits the cap; allow the
  // server a moment to notice the closes.
  let welcome: Msg | null = null;
  for (let i = 0; i < 10 && !welcome; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const c = await clients.connect();
    c.send({ t: "join" });
    const m = await c.waitFor((x) => x.t === "welcome" || x.t === "error");
    if (m.t === "welcome") welcome = m;
    else c.close();
  }
  expect(welcome, "a new room could not be created after the sockets left").not.toBeNull();
});
