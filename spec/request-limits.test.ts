import { afterEach, expect, inject, it } from "vitest";
import { Clients, sleep, startMatch, uniqueRoom } from "./helpers/ws.ts";

// A crafted client can send anything over /ws: oversized frames, broken JSON,
// out-of-range numbers, a flood. The server has to close the bad socket (or
// drop the excess), never throw, and keep serving everyone else.
const baseUrl = inject("baseUrl");
const clients = new Clients(baseUrl);
afterEach(() => clients.closeAll());

it("a message over 1 KB closes the socket", async () => {
  const { c } = await clients.join(uniqueRoom());
  c.send(JSON.stringify({ t: "ping", id: 1, pad: "x".repeat(2000) }));
  await c.waitClosed();
});

it.each([
  ["invalid JSON", "{not json"],
  ["a non-object", "42"],
  ["no t", JSON.stringify({ id: 1 })],
  ["an unknown type", JSON.stringify({ t: "launch-missiles" })],
  ["a second join", JSON.stringify({ t: "join" })],
  ["input with b out of range", JSON.stringify({ t: "input", seq: 0, b: 16, x: 0, y: 0 })],
  ["input with x out of range", JSON.stringify({ t: "input", seq: 0, b: 0, x: 101, y: 0 })],
  ["input with y out of range", JSON.stringify({ t: "input", seq: 0, b: 0, x: 0, y: -101 })],
  ["input with a fractional stick", JSON.stringify({ t: "input", seq: 0, b: 0, x: 0.5, y: 0 })],
  ["input with a string field", JSON.stringify({ t: "input", seq: 0, b: 0, x: "5", y: 0 })],
  ["input with a negative seq", JSON.stringify({ t: "input", seq: -1, b: 0, x: 0, y: 0 })],
  ["ping with a bad id", JSON.stringify({ t: "ping", id: "a" })],
  ["pick with an unknown fighter", JSON.stringify({ t: "pick", fighter: "nobody" })],
  ["ready with a non-boolean", JSON.stringify({ t: "ready", ready: "yes" })],
])("%s after join closes the socket", async (_name, payload) => {
  const { c } = await clients.join(uniqueRoom());
  c.send(payload);
  await c.waitClosed();
});

it.each([
  ["a ping", { t: "ping", id: 1 }],
  ["a ready", { t: "ready", ready: true }],
  ["an input", { t: "input", seq: 0, b: 0, x: 0, y: 0 }],
  ["a pick", { t: "pick", fighter: "brush" }],
])("%s before join closes the socket", async (_name, payload) => {
  const c = await clients.connect();
  c.send(payload);
  await c.waitClosed();
});

it("invalid join fields close the socket", async () => {
  for (const room of ["abcd", "ABC", "ABCDE", "AB1D", 5]) {
    const c = await clients.connect();
    c.send({ t: "join", room });
    await c.waitClosed();
  }
});

it("a binary message closes the socket", async () => {
  const { c } = await clients.join(uniqueRoom());
  c.ws.send(new Uint8Array([1, 2, 3]));
  await c.waitClosed();
});

it("a burst of 400 inputs is rate-limited, not fatal", async () => {
  const room = uniqueRoom();
  const { c: a } = await clients.join(room);
  const { c: b } = await clients.join(room);
  await startMatch(a, b);
  for (let i = 0; i < 400; i++) a.send({ t: "input", seq: i, b: 0, x: i % 2 ? 50 : -50, y: 0 });
  const mark = a.mark();
  a.send({ t: "ping", id: 777 });
  const pong = await a.waitFor((m) => m.t === "pong" && m.id === 777, 3000, mark);
  expect(pong.t).toBe("pong");
  expect(a.closed).toBe(false);
  expect(a.ws.readyState).toBe(WebSocket.OPEN);
});

it("many non-input messages in a burst close the socket", async () => {
  const { c } = await clients.join(uniqueRoom());
  for (let i = 0; i < 200; i++) c.send({ t: "ping", id: i });
  await c.waitClosed();
});

it("the server still answers GET / after all of that", async () => {
  await sleep(100);
  const res = await fetch(new URL("/", baseUrl));
  expect(res.status).toBe(200);
});
