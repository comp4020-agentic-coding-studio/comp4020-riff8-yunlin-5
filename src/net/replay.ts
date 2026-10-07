// The last match, as setup plus the exact inputs fed to step() each tick, kept
// as per-slot change lists. The sim is deterministic, so replaying the log
// reproduces the match; memory is bounded by MATCH_TICKS.
import type { Input, MatchState, PlayerSetup, StageId } from "../sim/index.ts";
import { createMatch, step } from "../sim/index.ts";

type Entry = Input | null;

// Hard ceiling on one recording's input log. Worst case is every slot changing
// every tick for a whole match: (120 countdown + 14400 fight ticks) x 4 slots x
// 8 bytes = 464,640 bytes, so this only trips on a match far longer than the sim allows.
export const MAX_RECORDING_BYTES = 512 * 1024;
const GROW = 1024; // Int32 words per allocation step (4 KB), so allocation stays close to use

// One entry is two Int32s: the step the input changed at, and the packed input
// (-1 for null; otherwise b << 16 | (x + 100) << 8 | (y + 100)).
const pack = (v: Input | null): number => (v === null ? -1 : (v.b << 16) | ((v.x + 100) << 8) | (v.y + 100));
const unpack = (c: number): Input | null => (c === -1 ? null : { b: c >> 16, x: ((c >> 8) & 255) - 100, y: (c & 255) - 100 });

export class Recording {
  readonly players: PlayerSetup[];
  readonly seed: number;
  readonly stage: StageId;
  readonly glyphs: string[];
  steps = 0;
  private maxBytes: number;
  private buf: Int32Array[] = [0, 1, 2, 3].map(() => new Int32Array(GROW));
  private len = [0, 0, 0, 0]; // Int32 words used per slot

  constructor(players: PlayerSetup[], seed: number, stage: StageId, glyphs: string[], maxBytes = MAX_RECORDING_BYTES) {
    this.players = players;
    this.seed = seed;
    this.stage = stage;
    this.glyphs = glyphs;
    this.maxBytes = maxBytes;
  }

  /** Bytes of input log in use. */
  get bytes(): number {
    return (this.len[0]! + this.len[1]! + this.len[2]! + this.len[3]!) * 4;
  }

  /** Log the inputs passed to one step() call. False once the log would pass its cap: drop the recording. */
  push(inputs: readonly (Input | null | undefined)[]): boolean {
    for (let s = 0; s < 4; s++) {
      const code = pack(inputs[s] ?? null);
      const n = this.len[s]!;
      if (n > 0 && this.buf[s]![n - 1] === code) continue;
      if (this.bytes + 8 > this.maxBytes) return false;
      if (n + 2 > this.buf[s]!.length) {
        const bigger = new Int32Array(this.buf[s]!.length + GROW);
        bigger.set(this.buf[s]!);
        this.buf[s] = bigger;
      }
      this.buf[s]![n] = this.steps;
      this.buf[s]![n + 1] = code;
      this.len[s] = n + 2;
    }
    this.steps++;
    return true;
  }

  start(): Cursor {
    return new Cursor(this, createMatch(this.players, this.seed, { stage: this.stage }));
  }

  /** The input for each slot at `step`; `idx` is the caller's per-slot entry cursor. */
  inputsAt(step: number, idx: number[]): Entry[] {
    return [0, 1, 2, 3].map((s) => {
      const buf = this.buf[s]!;
      const n = this.len[s]! / 2;
      while (idx[s]! + 1 < n && buf[(idx[s]! + 1) * 2]! <= step) idx[s]!++;
      return n > 0 && buf[idx[s]! * 2]! <= step ? unpack(buf[idx[s]! * 2 + 1]!) : null;
    });
  }
}

export class Cursor {
  state: MatchState;
  private rec: Recording;
  private idx = [0, 0, 0, 0];
  constructor(rec: Recording, state: MatchState) {
    this.rec = rec;
    this.state = state;
  }
  get glyphs(): string[] {
    return this.rec.glyphs;
  }
  /** Advance one tick; false once the recorded match has been fully replayed. */
  advance(): boolean {
    if (this.state.tick >= this.rec.steps) return false;
    this.state = step(this.state, this.rec.inputsAt(this.state.tick, this.idx));
    return true;
  }
  get done(): boolean {
    return this.state.tick >= this.rec.steps;
  }
}
