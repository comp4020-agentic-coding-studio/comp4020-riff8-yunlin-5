// Rooms: lobby, match, results. Pure bookkeeping around the sim; the socket
// layer (socket.ts) only moves bytes in and out of Client objects.
import { randomBytes, randomInt } from "node:crypto";
import type { FighterId, Input, MatchState, SimEvent, Slot } from "../sim/index.ts";
import { createMatch, cpuInput, step, FIGHTERS, NO_INPUT, STAGE } from "../sim/index.ts";
import { recordMatch } from "../db.ts";
import { buildResults, buildSnap } from "./protocol.ts";

export const MAX_ROOMS = 50;
export const MAX_SPECTATORS = 8;
const MAX_FIGHTERS = 4;
const RESULTS_MS = 6000;
const EMPTY_ROOM_MS = 2 * 60 * 1000;
// A client that stops sending input (frozen tab) shouldn't hold its last
// stick position forever.
const STALE_INPUT_TICKS = 30;
const CPU_GLYPH = "機";
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, no O

export interface Client {
  token: string; // server-only
  glyph: string;
  room: Room | null;
  slot: Slot | null;
  lastInput: Input;
  lastInputTick: number;
  send(data: string): void;
  close(code: number, reason?: string): void;
}

interface Seat {
  token: string;
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
  state: MatchState | null = null;
  emptySince: number | null;
  private pending: SimEvent[] = [];
  private resultsAt = 0;
  private glyphs: string[] = [];

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

  private seat(client: Client, slot: Slot): void {
    this.seats[slot] = {
      token: client.token,
      glyph: client.glyph,
      fighter: "wanderer",
      ready: false,
      cpu: false,
      client,
    };
    client.slot = slot;
  }

  /** Returns "room_full" if it can't take another spectator or fighter. The caller sends welcome, then broadcastLobby(). */
  join(client: Client): "room_full" | { rejoined: boolean } {
    const alreadyHere = [...this.clients].some((c) => c.token === client.token);
    if (this.phase === "match" && !alreadyHere) {
      for (const s of slots) {
        const seat = this.seats[s];
        const f = this.state?.fighters[s];
        if (seat && !seat.cpu && seat.client === null && seat.token === client.token && f && !f.forfeited) {
          seat.client = client;
          client.slot = s;
          client.lastInput = NO_INPUT; // a non-null input is what brings the fighter back
          client.lastInputTick = this.state!.tick;
          this.attach(client);
          return { rejoined: true };
        }
      }
    }
    const slot = this.phase === "lobby" && !alreadyHere ? this.freeSlot() : null;
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
    client.room = null;
    if (client.slot !== null) {
      const seat = this.seats[client.slot];
      if (seat && seat.client === client) {
        // In a match the seat stays so the same token can reclaim it; the sim
        // sees null input for that slot from the next tick (ADR).
        if (this.phase === "match") seat.client = null;
        else this.seats[client.slot] = null;
      }
      client.slot = null;
    }
    if (this.clients.size === 0) this.emptySince = now;
    this.broadcastLobby();
    this.maybeStart();
  }

  pick(client: Client, fighter: FighterId): void {
    const seat = this.mySeat(client);
    if (!seat || this.phase !== "lobby") return;
    seat.fighter = fighter;
    this.broadcastLobby();
  }

  setReady(client: Client, ready: boolean): void {
    const seat = this.mySeat(client);
    if (!seat || this.phase !== "lobby") return;
    seat.ready = ready;
    this.broadcastLobby();
    this.maybeStart();
  }

  setCpu(client: Client, add: boolean): void {
    if (this.phase !== "lobby" || !this.mySeat(client)) return;
    if (add) {
      const slot = this.freeSlot();
      if (slot === null) return;
      this.seats[slot] = { token: "", glyph: CPU_GLYPH, fighter: "wanderer", ready: true, cpu: true, client: null };
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
    this.state = createMatch(
      slots.flatMap((s) => {
        const seat = this.seats[s];
        return seat ? [{ slot: s, fighter: seat.fighter, cpu: seat.cpu }] : [];
      }),
      randomBytes(4).readUInt32BE(0),
    );
    this.pending = [];
    this.phase = "match";
    this.broadcastLobby();
  }

  /** One sim tick. Called by the global loop for every room. */
  tick(now: number): void {
    if (this.phase === "match" && this.state) this.tickMatch(now);
    else if (this.phase === "results" && now >= this.resultsAt) this.toLobby();
  }

  private tickMatch(now: number): void {
    const state = this.state!;
    const inputs: (Input | null)[] = [];
    for (const s of slots) {
      const seat = this.seats[s];
      if (!seat) inputs.push(null);
      else if (seat.cpu) inputs.push(state.fighters[s] ? cpuInput(state, s) : null);
      else if (!seat.client) inputs.push(null);
      else {
        const c = seat.client;
        inputs.push(state.tick - c.lastInputTick > STALE_INPUT_TICKS ? NO_INPUT : c.lastInput);
      }
    }
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
      );
    } catch (err) {
      console.error("recordMatch failed", err);
    }
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
        return [{ slot: s, glyph: seat.glyph, fighter: seat.fighter, ready: seat.ready, cpu: seat.cpu, present }];
      }),
      spectators: this.spectators,
      you: client.slot, // which entry of players is this socket (changes on promotion)
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
        this.rooms.delete(room.code);
      }
    }
  }

  /** Drop rooms that have had no sockets for two minutes. */
  reap(now: number): void {
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && now - room.emptySince >= EMPTY_ROOM_MS) this.rooms.delete(room.code);
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
    stage: STAGE,
    fighters: Object.values(FIGHTERS).map((f) => ({ id: f.id, name: f.name })),
    tickRate: 60,
    snapRate: 30,
  });
}
