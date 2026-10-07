// Rooms: lobby, match, results. Pure bookkeeping around the sim; the socket
// layer (socket.ts) only moves bytes in and out of Client objects.
import { randomBytes, randomInt } from "node:crypto";
import type { FighterId, Input, MatchState, SimEvent, Slot, StageId } from "../sim/index.ts";
import { createMatch, cpuInput, step, FIGHTERS, NO_INPUT, STAGES } from "../sim/index.ts";
import { recordMatch } from "../db.ts";
import { sealGlyph } from "../seal.ts";
import { buildResults, buildSnap } from "./protocol.ts";
import { Recording, type Cursor } from "./replay.ts";

export const MAX_ROOMS = 50;
export const MAX_SPECTATORS = 8;
const MAX_REPLAYS = 8; // concurrent replays per room
const MAX_REPLAYS_GLOBAL = 16; // across every room
let activeReplays = 0;
const MAX_FIGHTERS = 4;
const RESULTS_MS = 6000;
const EMPTY_ROOM_MS = 2 * 60 * 1000;
// A client that stops sending input (frozen tab) shouldn't hold its last
// stick position forever.
const STALE_INPUT_TICKS = 30;
// Must match GLYPHS in src/seal.ts, in the same order: a seat whose own glyph
// is already shown by another seat takes the next unused one from here.
const GLYPH_POOL = ["鑑", "賞", "藏", "觀", "閱", "記", "題", "珍", "玩", "守", "傳", "校"];
const CPU_GLYPHS = ["機", "械", "偶", "影"];
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, no O

export interface Client {
  token: string; // server-only
  glyph: string;
  room: Room | null;
  slot: Slot | null; // the socket's own seat
  guestSlot: Slot | null; // the local guest's seat, if one was added
  send(data: string): void;
  close(code: number, reason?: string): void;
}

interface Seat {
  key: string; // the token, or `${token}#guest` for a guest seat; never sent
  guest: boolean;
  input: Input;
  inputTick: number;
  latched: number; // OR of every b received since the last tick, so a tap shorter than a tick still lands
  glyph: string;
  fighter: FighterId;
  ready: boolean;
  cpu: boolean;
  client: Client | null;
}

type RoomPhase = "lobby" | "match" | "results";

const slots: readonly Slot[] = [0, 1, 2, 3];

export class Room {
  readonly code: string;
  readonly createdAt: number;
  clients = new Set<Client>();
  seats: (Seat | null)[] = [null, null, null, null];
  phase: RoomPhase = "lobby";
  stage: StageId = "riverbank";
  state: MatchState | null = null;
  emptySince: number | null;
  private pending: SimEvent[] = [];
  private resultsAt = 0;
  private glyphs: string[] = [];
  private recording: Recording | null = null; // the match in progress
  private lastMatch: Recording | null = null; // the last finished match
  private replays = new Map<Client, Cursor>();

  constructor(code: string, now: number) {
    this.code = code;
    this.createdAt = now;
    this.emptySince = now;
  }

  get spectators(): number {
    let n = 0;
    for (const c of this.clients) if (c.slot === null) n++;
    return n;
  }

  private freeSlot(): Slot | null {
    return slots.find((s) => this.seats[s] === null) ?? null;
  }

  private uniqueGlyph(pool: readonly string[], wanted: string): string {
    const taken = new Set(this.seats.map((x) => x?.glyph));
    const start = Math.max(0, pool.indexOf(wanted));
    for (let i = 0; i < pool.length; i++) {
      const g = pool[(start + i) % pool.length]!;
      if (!taken.has(g)) return g;
    }
    return wanted;
  }

  private seat(client: Client, slot: Slot): void {
    const glyph = this.uniqueGlyph(GLYPH_POOL, sealGlyph(client.token));
    client.glyph = glyph;
    this.seats[slot] = {
      key: client.token,
      guest: false,
      input: NO_INPUT,
      inputTick: 0,
      latched: 0,
      glyph,
      fighter: "wanderer",
      ready: false,
      cpu: false,
      client,
    };
    client.slot = slot;
  }

  /**
   * Returns "room_full" if it can't take another spectator or fighter. The
   * caller sends welcome, then broadcastLobby(). A token that already holds a
   * seat takes it over (docs D5): the old socket, if any, is told and closed.
   */
  join(client: Client): "room_full" | { rejoined: boolean } {
    const guestKey = `${client.token}#guest`;
    let took = false;
    const replaced = new Set<Client>();
    for (const s of slots) {
      const seat = this.seats[s];
      if (!seat || seat.cpu || (seat.key !== client.token && seat.key !== guestKey)) continue;
      const old = seat.client;
      if (old && old !== client && !replaced.has(old)) {
        replaced.add(old);
        this.clients.delete(old);
        this.dropReplay(old);
        old.room = null;
        old.slot = null;
        old.guestSlot = null;
        old.send(JSON.stringify({ t: "error", code: "replaced", message: "This seal joined from somewhere else." }));
        old.close(4000, "replaced");
      }
      seat.client = client;
      seat.latched = 0;
      seat.input = NO_INPUT; // a non-null input is what brings an absent fighter back
      seat.inputTick = this.state?.tick ?? 0;
      if (seat.guest) client.guestSlot = s;
      else {
        client.slot = s;
        client.glyph = seat.glyph;
      }
      took = true;
    }
    if (took) {
      this.attach(client);
      return { rejoined: this.phase === "match" };
    }
    const slot = this.phase === "lobby" ? this.freeSlot() : null;
    if (slot === null && this.spectators >= MAX_SPECTATORS) return "room_full";
    if (slot !== null) this.seat(client, slot);
    else client.slot = null;
    this.attach(client);
    return { rejoined: false };
  }

  private attach(client: Client): void {
    client.room = this;
    this.clients.add(client);
    this.emptySince = null;
  }

  leave(client: Client, now: number): void {
    if (!this.clients.delete(client)) return;
    this.dropReplay(client);
    client.room = null;
    for (const slot of [client.slot, client.guestSlot]) {
      if (slot === null) continue;
      const seat = this.seats[slot];
      if (seat && seat.client === client) {
        // In a match the seat stays so the same token can reclaim it; the sim
        // sees null input for that slot from the next tick (ADR).
        if (this.phase === "match") seat.client = null;
        else this.seats[slot] = null;
      }
    }
    client.slot = null;
    client.guestSlot = null;
    if (this.clients.size === 0) this.emptySince = now;
    this.broadcastLobby();
    this.maybeStart();
  }

  pick(client: Client, fighter: FighterId, p: 0 | 1 = 0): void {
    const seat = p === 1 ? this.guestSeat(client) : this.mySeat(client);
    if (!seat || this.phase !== "lobby") return;
    seat.fighter = fighter;
    this.broadcastLobby();
  }

  setReady(client: Client, ready: boolean): void {
    const seat = this.mySeat(client);
    if (!seat || this.phase !== "lobby") return;
    seat.ready = ready;
    const guest = this.guestSeat(client);
    if (guest) guest.ready = ready; // the owner's ready toggles both seats
    this.broadcastLobby();
    this.maybeStart();
  }

  setGuest(client: Client, add: boolean): void {
    const owner = this.mySeat(client);
    if (this.phase !== "lobby" || !owner) return;
    if (add) {
      const slot = this.freeSlot();
      if (client.guestSlot !== null || slot === null) return;
      const key = `${client.token}#guest`;
      this.seats[slot] = {
        key,
        guest: true,
        input: NO_INPUT,
        inputTick: 0,
        latched: 0,
        glyph: this.uniqueGlyph(GLYPH_POOL, sealGlyph(key)),
        fighter: "wanderer",
        ready: owner.ready,
        cpu: false,
        client,
      };
      client.guestSlot = slot;
    } else {
      if (client.guestSlot === null) return;
      this.seats[client.guestSlot] = null;
      client.guestSlot = null;
    }
    this.broadcastLobby();
    this.maybeStart();
  }

  /** Record one input message for the socket's own seat (p 0) or its guest (p 1). */
  input(client: Client, p: 0 | 1, b: number, x: number, y: number): void {
    if (!this.state) return;
    const seat = p === 1 ? this.guestSeat(client) : this.mySeat(client);
    if (!seat) return;
    seat.input = { b, x, y };
    seat.inputTick = this.state.tick;
    seat.latched |= b;
  }

  private guestSeat(client: Client): Seat | null {
    if (client.guestSlot === null) return null;
    const seat = this.seats[client.guestSlot];
    return seat && seat.client === client ? seat : null;
  }

  setStage(client: Client, id: StageId): void {
    if (this.phase !== "lobby" || !this.mySeat(client)) return;
    this.stage = id;
    // Nobody stays readied onto a stage they didn't see.
    for (const seat of this.seats) if (seat && !seat.cpu) seat.ready = false;
    this.broadcastLobby();
  }

  setCpu(client: Client, add: boolean): void {
    if (this.phase !== "lobby" || !this.mySeat(client)) return;
    if (add) {
      const slot = this.freeSlot();
      if (slot === null) return;
      this.seats[slot] = { key: "", guest: false, input: NO_INPUT, inputTick: 0, latched: 0, glyph: this.uniqueGlyph(CPU_GLYPHS, CPU_GLYPHS[0]!), fighter: "wanderer", ready: true, cpu: true, client: null };
    } else {
      for (const s of [...slots].reverse()) {
        if (this.seats[s]?.cpu) {
          this.seats[s] = null;
          break;
        }
      }
    }
    this.broadcastLobby();
    this.maybeStart();
  }

  private mySeat(client: Client): Seat | null {
    if (client.slot === null) return null;
    const seat = this.seats[client.slot];
    return seat && seat.client === client ? seat : null;
  }

  private maybeStart(): void {
    if (this.phase !== "lobby") return;
    let fighters = 0;
    let humans = 0;
    for (const seat of this.seats) {
      if (!seat) continue;
      fighters++;
      if (!seat.cpu) {
        humans++;
        if (!seat.ready) return;
      }
    }
    if (fighters < 2 || humans < 1) return;
    this.glyphs = this.seats.map((s) => s?.glyph ?? "?");
    const setup = slots.flatMap((s) => {
      const seat = this.seats[s];
      return seat ? [{ slot: s, fighter: seat.fighter, cpu: seat.cpu }] : [];
    });
    const seed = randomBytes(4).readUInt32BE(0);
    this.state = createMatch(setup, seed, { stage: this.stage });
    this.recording = new Recording(setup, seed, this.stage, this.glyphs);
    this.stopAllReplays();
    this.pending = [];
    this.phase = "match";
    this.broadcastLobby();
  }

  /** One sim tick. Called by the global loop for every room. */
  tick(now: number): void {
    if (this.phase === "match" && this.state) this.tickMatch(now);
    else if (this.phase === "results" && now >= this.resultsAt) this.toLobby();
    if (this.replays.size > 0) this.tickReplays();
  }

  /** Start (or restart) a replay of the last match for this socket. Lobby phase only. */
  startReplay(client: Client, speed: 1 | 2 | 4 = 1): void {
    if (this.phase !== "lobby" || !this.lastMatch || !this.clients.has(client)) return;
    if (!this.replays.has(client) && (this.replays.size >= MAX_REPLAYS || activeReplays >= MAX_REPLAYS_GLOBAL)) return;
    this.dropReplay(client);
    activeReplays++;
    this.replays.set(client, this.lastMatch.start());
    this.replaySpeed.set(client, speed);
  }

  /** Forget a socket's replay (and its share of the global cap) without telling it. */
  private dropReplay(client: Client): boolean {
    this.replayPending.delete(client);
    this.replaySpeed.delete(client);
    if (!this.replays.delete(client)) return false;
    activeReplays--;
    return true;
  }

  /** The room is going away: release its replays' share of the global cap. */
  dispose(): void {
    for (const c of [...this.replays.keys()]) this.dropReplay(c);
  }

  stopReplay(client: Client): void {
    if (this.dropReplay(client)) client.send(JSON.stringify({ t: "replayEnd" }));
  }

  private stopAllReplays(): void {
    for (const c of [...this.replays.keys()]) this.stopReplay(c);
  }

  private tickReplays(): void {
    for (const [client, cur] of [...this.replays]) {
      for (let n = this.replaySpeed.get(client) ?? 1; n > 0; n--) this.replayStep(client, cur);
    }
  }

  private replayStep(client: Client, cur: Cursor): void {
    if (!this.replays.has(client)) return;
    if (!cur.advance()) {
      this.stopReplay(client);
      return;
    }
    const st = cur.state;
    const pending = this.replayPending.get(client) ?? [];
    pending.push(...st.events);
    const last = cur.done;
    if (st.tick % 2 === 0 || last) {
      client.send(buildSnap(st, cur.glyphs, pending, true));
      this.replayPending.delete(client);
    } else {
      this.replayPending.set(client, pending);
    }
    if (last) this.stopReplay(client);
  }
  private replayPending = new Map<Client, SimEvent[]>();
  private replaySpeed = new Map<Client, 1 | 2 | 4>(); // fast-forward factor, default 1

  private tickMatch(now: number): void {
    const state = this.state!;
    const inputs: (Input | null)[] = [];
    for (const s of slots) {
      const seat = this.seats[s];
      if (!seat) inputs.push(null);
      else if (seat.cpu) inputs.push(state.fighters[s] ? cpuInput(state, s) : null);
      else if (!seat.client) inputs.push(null);
      else {
        const cur = state.tick - seat.inputTick > STALE_INPUT_TICKS ? NO_INPUT : seat.input;
        inputs.push({ b: cur.b | seat.latched, x: cur.x, y: cur.y });
        seat.latched = 0;
      }
    }
    this.recording?.push(inputs);
    const next = step(state, inputs);
    this.state = next;
    for (const e of next.events) this.pending.push(e);
    const ended = next.phase === "ended";
    if (next.tick % 2 === 0 || ended) {
      this.broadcast(buildSnap(next, this.glyphs, this.pending));
      this.pending = [];
    }
    if (ended) this.finish(now);
  }

  private finish(now: number): void {
    const state = this.state!;
    const results = buildResults(state, this.glyphs);
    this.broadcast(
      JSON.stringify({ t: "end", winner: state.winner, results, durationTicks: state.tick }),
    );
    const w = results.find((r) => r.slot === state.winner);
    try {
      recordMatch(
        state.tick,
        w ? { glyph: w.glyph, fighter: w.fighter } : null,
        results.map((r) => ({ glyph: r.glyph, fighter: r.fighter, kos: r.kos, falls: r.falls, placement: r.placement })),
        state.stage,
      );
    } catch (err) {
      console.error("recordMatch failed", err);
    }
    this.lastMatch = this.recording;
    this.recording = null;
    this.phase = "results";
    this.resultsAt = now + RESULTS_MS;
    this.broadcastLobby();
  }

  private toLobby(): void {
    this.phase = "lobby";
    this.state = null;
    this.pending = [];
    for (const s of slots) {
      const seat = this.seats[s];
      if (!seat) continue;
      if (!seat.cpu && !seat.client) this.seats[s] = null;
      else if (!seat.cpu) seat.ready = false;
    }
    // Spectators who waited out the match take free slots, oldest first.
    for (const c of this.clients) {
      if (c.slot !== null) continue;
      if (this.seats.some((x) => x && !x.cpu && x.key === c.token)) continue; // one seal, one seat
      const slot = this.freeSlot();
      if (slot === null) break;
      this.seat(c, slot);
    }
    this.broadcastLobby();
    this.maybeStart();
  }

  broadcast(data: string): void {
    for (const c of this.clients) c.send(data);
  }

  lobbyFor(client: Client): string {
    return JSON.stringify({
      t: "lobby",
      room: this.code,
      phase: this.phase,
      players: slots.flatMap((s) => {
        const seat = this.seats[s];
        if (!seat) return [];
        const f = this.state?.fighters[s];
        const present = (seat.cpu || seat.client !== null) && !f?.forfeited;
        return [{ slot: s, glyph: seat.glyph, fighter: seat.fighter, ready: seat.ready, cpu: seat.cpu, guest: seat.guest, present }];
      }),
      replayAvailable: this.lastMatch !== null,
      stage: this.stage,
      stages: Object.values(STAGES).map((g) => ({ id: g.id, name: g.name })),
      stageDef: STAGES[this.stage],
      spectators: this.spectators,
      you: client.slot, // which entry of players is this socket (changes on promotion)
      youGuest: client.guestSlot, // this socket's local guest seat, or null
    });
  }

  broadcastLobby(): void {
    for (const c of this.clients) c.send(this.lobbyFor(c));
  }
}

export interface Welcome {
  room: Room;
  rejoined: boolean;
}

export class RoomManager {
  rooms = new Map<string, Room>();

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 4; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private create(code: string | undefined, now: number): Room | null {
    if (this.rooms.size >= MAX_ROOMS) {
      const empties = [...this.rooms.values()].filter((r) => r.clients.size === 0).sort((a, b) => a.createdAt - b.createdAt);
      for (const r of empties) {
        r.dispose();
        this.rooms.delete(r.code);
        if (this.rooms.size < MAX_ROOMS) break;
      }
      if (this.rooms.size >= MAX_ROOMS) return null;
    }
    const room = new Room(code ?? this.newCode(), now);
    this.rooms.set(room.code, room);
    return room;
  }

  join(client: Client, code: string | undefined, now: number): Welcome | { error: "rooms_full" | "room_full" | "no_room" } {
    let room = code ? this.rooms.get(code) : undefined;
    if (!room) {
      room = this.create(code, now) ?? undefined;
      if (!room) return { error: code ? "no_room" : "rooms_full" };
    }
    const res = room.join(client);
    if (res === "room_full") return { error: "room_full" };
    return { room, rejoined: res.rejoined };
  }

  leave(client: Client, now: number): void {
    client.room?.leave(client, now);
  }

  tick(now: number): void {
    for (const room of this.rooms.values()) {
      try {
        room.tick(now);
      } catch (err) {
        console.error(`room ${room.code} tick failed`, err);
        // A room that throws every tick would spin forever: close it out.
        for (const c of [...room.clients]) c.close(1011, "internal error");
        room.dispose();
        this.rooms.delete(room.code);
      }
    }
  }

  /** Drop rooms that have had no sockets for two minutes. */
  reap(now: number): void {
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && now - room.emptySince >= EMPTY_ROOM_MS) {
        room.dispose();
        this.rooms.delete(room.code);
      }
    }
  }
}

export function welcomeMessage(client: Client, room: Room, rejoined: boolean): string {
  return JSON.stringify({
    t: "welcome",
    room: room.code,
    slot: client.slot,
    glyph: client.glyph,
    rejoined,
    stage: STAGES[room.stage],
    fighters: Object.values(FIGHTERS).map((f) => ({ id: f.id, name: f.name })),
    tickRate: 60,
    snapRate: 30,
  });
}
