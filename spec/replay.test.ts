import { afterEach, expect, inject, it } from "vitest";
import { Clients, sleep, uniqueRoom, type Client, type Msg } from "./helpers/ws.ts";

const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

const summary = (snap: Msg) =>
  snap.fighters.map((f: any) => ({ slot: f.slot, stocks: f.stocks, damage: f.damage, x: f.x, y: f.y }));

// B holds right and jumps off the stage edge until out of stocks (a plain walk-off
// is caught by the sim's ledge assist, a jump carries past its reach).
async function playToEnd(a: Client, b: Client): Promise<{ lastLive: Msg; end: Msg }> {
  a.send({ t: "ready", ready: true });
  b.send({ t: "ready", ready: true });
  let seq = 0;
  const pump = setInterval(() => {
    if (b.ws.readyState === WebSocket.OPEN) b.send({ t: "input", seq: seq, b: seq++ % 2, x: 100, y: 0 });
  }, 16);
  try {
    const end = await a.waitType("end", 30000);
    const i = a.msgs.indexOf(end);
    const lastLive = [...a.msgs.slice(0, i)].reverse().find((m) => m.t === "snap")!;
    return { lastLive, end };
  } finally {
    clearInterval(pump);
  }
}

it("replaying the last match ends on exactly the state the live match did", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room);
  const { c: b } = await clients.join(room);
  const { lastLive } = await playToEnd(a, b);
  expect(lastLive.phase).toBe("ended");

  // Results for 6 s, then the lobby, which is the only phase a replay is served in.
  const lobby = await a.waitFor((m) => m.t === "lobby" && m.phase === "lobby" && m.replayAvailable === true, 12000, a.mark() - 1);
  expect(lobby.replayAvailable).toBe(true);

  const mark = a.mark();
  // speed 4 keeps the suite short; the log and the sim are the same at any speed.
  a.send({ t: "replay", speed: 4 });
  await a.waitType("replayEnd", 30000, mark);
  const replay = a.msgs.slice(mark).filter((m) => m.t === "snap");
  expect(replay.length).toBeGreaterThan(10);
  expect(replay.every((m) => m.replay === true)).toBe(true);
  expect(summary(replay.at(-1)!)).toEqual(summary(lastLive));
  expect(b.msgs.slice(b.mark() - 1).some((m) => m.replay === true)).toBe(false);
}, 60000);

it("a replay request outside the lobby is ignored, and malformed ones close the socket", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room);
  const { c: b } = await clients.join(room);
  // No match yet, so nothing to replay: ignored, the socket stays open.
  a.send({ t: "replay" });
  a.send({ t: "ping", id: 1 });
  await a.waitType("pong");
  expect(a.msgs.some((m) => m.replay === true || m.t === "replayEnd")).toBe(false);
  expect((await a.waitType("lobby")).replayAvailable).toBe(false);
  b.send({ t: "replay", stop: "yes" });
  expect(await b.waitClosed()).toBe(1008);
  const { c: d } = await clients.join(uniqueRoom());
  d.send({ t: "replay", speed: 3 });
  expect(await d.waitClosed()).toBe(1008);
  await sleep(0);
});
