// Shared helpers for the WebSocket specs: not a test file. Everything talks to
// the RUNNING app (spec/global-setup.ts finds it) over Node's global WebSocket.
import { randomInt } from "node:crypto";

// A..Z without I and O, as the server's own generator.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const used = new Set<string>();

// A room code no other test in this run has used. Four letters is all the
// protocol allows, so "per-run random" means random per call, never repeated.
export function uniqueRoom(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += LETTERS[randomInt(LETTERS.length)];
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
}

export function wsUrl(baseUrl: string): string {
  const u = new URL("/ws", baseUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

// A real seal token, issued by GET / exactly as a browser would receive it.
export async function getSeal(baseUrl: string): Promise<{ token: string; cookie: string }> {
  const res = await fetch(new URL("/", baseUrl));
  await res.text();
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("GET / set no seal cookie");
  const pair = setCookie.split(";")[0]!;
  return { token: pair.split("=")[1]!, cookie: pair };
}

export interface Msg {
  t: string;
  [k: string]: any;
}

export class Client {
  readonly ws: WebSocket;
  readonly raw: string[] = [];
  readonly msgs: Msg[] = [];
  closeCode: number | null = null;
  closed = false;
  private waiters: (() => void)[] = [];

  constructor(baseUrl: string, cookie?: string) {
    // Node's WebSocket (undici) accepts a headers option, which is the only way
    // to present a chosen Cookie. No Origin is sent, which the server allows.
    this.ws = cookie
      ? new (WebSocket as unknown as new (u: string, o: object) => WebSocket)(wsUrl(baseUrl), {
          headers: { Cookie: cookie },
        })
      : new WebSocket(wsUrl(baseUrl));
    this.ws.addEventListener("message", (e) => {
      const s = String(e.data);
      this.raw.push(s);
      try {
        this.msgs.push(JSON.parse(s));
      } catch {
        this.msgs.push({ t: "?unparseable" });
      }
      this.wake();
    });
    this.ws.addEventListener("close", (e) => {
      this.closed = true;
      this.closeCode = e.code;
      this.wake();
    });
    this.ws.addEventListener("error", () => this.wake());
  }

  private wake() {
    for (const w of this.waiters.splice(0)) w();
  }

  open(timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      const timer = setTimeout(() => reject(new Error("socket did not open")), timeoutMs);
      this.ws.addEventListener("open", () => (clearTimeout(timer), resolve()), { once: true });
      this.ws.addEventListener("error", () => (clearTimeout(timer), reject(new Error("socket error before open"))), {
        once: true,
      });
    });
  }

  send(m: object | string): void {
    this.ws.send(typeof m === "string" ? m : JSON.stringify(m));
  }

  // Resolves with the first message at index >= from matching pred; rejects on
  // timeout or when the socket closes with no match.
  waitFor(pred: (m: Msg) => boolean, timeoutMs = 3000, from = 0): Promise<Msg> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const check = () => {
        for (let i = from; i < this.msgs.length; i++) {
          if (pred(this.msgs[i]!)) return resolve(this.msgs[i]!);
        }
        if (this.closed) return reject(new Error(`socket closed (${this.closeCode}) while waiting`));
        const left = deadline - Date.now();
        if (left <= 0) return reject(new Error(`timed out after ${timeoutMs} ms waiting for a message`));
        const timer = setTimeout(() => {
          const i = this.waiters.indexOf(onWake);
          if (i >= 0) this.waiters.splice(i, 1);
          check();
        }, left);
        const onWake = () => (clearTimeout(timer), check());
        this.waiters.push(onWake);
      };
      check();
    });
  }

  waitType(t: string, timeoutMs = 3000, from = 0): Promise<Msg> {
    return this.waitFor((m) => m.t === t, timeoutMs, from);
  }

  waitClosed(timeoutMs = 3000): Promise<number> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        if (this.closed) return resolve(this.closeCode ?? 0);
        const left = deadline - Date.now();
        if (left <= 0) return reject(new Error("socket was not closed by the server"));
        const timer = setTimeout(check, left);
        this.waiters.push(() => (clearTimeout(timer), check()));
      };
      check();
    });
  }

  // Index to pass as `from`, so a wait only sees messages after this point.
  mark(): number {
    return this.msgs.length;
  }

  close(): void {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close();
  }
}

// Tracks every client a test makes so afterEach can close them all.
export class Clients {
  private all: Client[] = [];
  constructor(private baseUrl: string) {}

  async connect(cookie?: string): Promise<Client> {
    const c = new Client(this.baseUrl, cookie);
    this.all.push(c);
    await c.open();
    return c;
  }

  // Connect, send join, and wait for the welcome.
  async join(room?: string, cookie?: string): Promise<{ c: Client; welcome: Msg }> {
    const c = await this.connect(cookie);
    c.send(room ? { t: "join", room } : { t: "join" });
    const welcome = await c.waitType("welcome");
    return { c, welcome };
  }

  closeAll(): void {
    for (const c of this.all.splice(0)) c.close();
  }
}

// Both clients ready, then resolve once each has seen a "fight" snap.
export async function startMatch(a: Client, b: Client): Promise<void> {
  const ma = a.mark();
  const mb = b.mark();
  a.send({ t: "ready", ready: true });
  b.send({ t: "ready", ready: true });
  const fight = (m: Msg) => m.t === "snap" && m.phase === "fight";
  await Promise.all([a.waitFor(fight, 6000, ma), b.waitFor(fight, 6000, mb)]);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
