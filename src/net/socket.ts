// The /ws endpoint: upgrade checks, per-socket rate limits and validation,
// the global 60 Hz loop, and the keepalive ping. Contract §5.
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { sealToken } from "../cookies.ts";
import { sealGlyph } from "../seal.ts";
import { parseClientMessage } from "./protocol.ts";
import { RoomManager, welcomeMessage, type Client } from "./rooms.ts";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 5;
const PING_MS = 20_000;
const MAX_SOCKETS = 400;
const JOIN_TIMEOUT_MS = 10_000;

function guard(what: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`${what} failed`, err);
  }
}
const MAX_BUFFERED = 512 * 1024;
const INPUT_RATE = 120; // per second
const OTHER_RATE = 20; // per second, all other types together

class Bucket {
  private tokens: number;
  private last: number;
  rate: number;
  constructor(rate: number, now: number) {
    this.rate = rate;
    this.tokens = rate;
    this.last = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.rate, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export interface NetHandle {
  rooms: RoomManager;
  close(): void;
}

export function attachWs(server: Server): NetHandle {
  const rooms = new RoomManager();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  // Cleared by each ping, set by the pong; still clear at the next ping = dead.
  const alive = new WeakMap<WebSocket, boolean>();

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => socket.destroy());
    let path: string;
    try {
      path = new URL(req.url ?? "/", "http://internal").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (path !== "/ws") {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let ok = false;
      try {
        ok = new URL(origin).host === req.headers.host;
      } catch {
        // malformed Origin: refuse
      }
      if (!ok) {
        socket.end("HTTP/1.1 403 Forbidden\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        return;
      }
    }
    if (wss.clients.size >= MAX_SOCKETS) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const { token } = sealToken(req.headers.cookie);
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, token));
  });

  function onConnection(ws: WebSocket, token: string): void {
    const t0 = performance.now();
    const inputBucket = new Bucket(INPUT_RATE, t0);
    const otherBucket = new Bucket(OTHER_RATE, t0);
    let joined = false;
    alive.set(ws, true);
    const client: Client = {
      token,
      glyph: sealGlyph(token),
      room: null,
      slot: null,
      guestSlot: null,
      send(data) {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFERED) {
          ws.terminate();
          return;
        }
        ws.send(data);
      },
      close(code, reason) {
        try {
          ws.close(code, reason);
        } catch {
          ws.terminate();
        }
      },
    };

    // A socket that never says join is just holding a connection open.
    const joinTimer = setTimeout(() => {
      if (!joined) client.close(1008, "join timeout");
    }, JOIN_TIMEOUT_MS);
    ws.on("error", () => {});
    ws.on("pong", () =>
      guard("pong", () => {
        alive.set(ws, true);
      }),
    );
    ws.on("close", () =>
      guard("close", () => {
        clearTimeout(joinTimer);
        rooms.leave(client, performance.now());
      }),
    );
    ws.on("message", (data, isBinary) => {
      try {
        if (isBinary) return client.close(1003, "text only");
        const msg = parseClientMessage(data.toString("utf8"));
        if (!msg) return client.close(1008, "bad message");
        const now = performance.now();
        if (msg.t === "input") {
          if (!joined) return client.close(1008, "join first");
          inputBucket.rate = client.guestSlot !== null ? INPUT_RATE * 2 : INPUT_RATE;
          if (!inputBucket.take(now)) return;
          client.room?.input(client, msg.p, msg.b, msg.x, msg.y);
          return;
        }
        if (!otherBucket.take(now)) return client.close(1008, "rate limit");
        if (!joined) {
          if (msg.t !== "join") return client.close(1008, "join first");
          const res = rooms.join(client, msg.room, now);
          if ("error" in res) {
            const message =
              res.error === "rooms_full" ? "every room is in use" : res.error === "room_full" ? "that room is full" : "no such room";
            client.send(JSON.stringify({ t: "error", code: res.error, message }));
            return client.close(res.error === "no_room" ? 1008 : 1013, res.error);
          }
          joined = true;
          client.send(welcomeMessage(client, res.room, res.rejoined));
          res.room.broadcastLobby();
          return;
        }
        switch (msg.t) {
          case "join":
            return client.close(1008, "already joined");
          case "pick":
            return client.room?.pick(client, msg.fighter, msg.p);
          case "replay":
            return msg.stop ? client.room?.stopReplay(client) : client.room?.startReplay(client, msg.speed);
          case "guest":
            return client.room?.setGuest(client, msg.add);
          case "ready":
            return client.room?.setReady(client, msg.ready);
          case "cpu":
            return client.room?.setCpu(client, msg.add);
          case "stage":
            return client.room?.setStage(client, msg.id);
          case "ping":
            return client.send(JSON.stringify({ t: "pong", id: msg.id }));
        }
      } catch (err) {
        console.error("ws handler failed", err);
        client.close(1011, "internal error");
      }
    });
  }

  let acc = 0;
  let last = performance.now();
  const loop = setInterval(() => guard("loop", () => {
    const now = performance.now();
    acc += now - last;
    last = now;
    let n = 0;
    while (acc >= TICK_MS && n < MAX_CATCHUP_TICKS) {
      rooms.tick(now);
      acc -= TICK_MS;
      n++;
    }
    if (acc > TICK_MS) acc = 0; // fell behind: drop the backlog rather than spiral
  }), 4);

  const reaper = setInterval(() => guard("reaper", () => rooms.reap(performance.now())), 5000);

  const heartbeat = setInterval(() => {
    guard("heartbeat", () => {
      for (const ws of wss.clients) {
        if (alive.get(ws) === false) {
          ws.terminate();
          continue;
        }
        alive.set(ws, false);
        ws.ping();
      }
    });
  }, PING_MS);

  return {
    rooms,
    close() {
      clearInterval(loop);
      clearInterval(reaper);
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
