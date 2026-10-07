// The last match, as setup plus the exact inputs fed to step() each tick, kept
// as per-slot change lists. The sim is deterministic, so replaying the log
// reproduces the match; memory is bounded by MATCH_TICKS.
import type { Input, MatchState, PlayerSetup, StageId } from "../sim/index.ts";
import { createMatch, step } from "../sim/index.ts";

type Entry = Input | null;

export class Recording {
  readonly players: PlayerSetup[];
  readonly seed: number;
  readonly stage: StageId;
  readonly glyphs: string[];
  steps = 0;
  // Per slot: the step at which the input changed, and its new value.
  private at: number[][] = [[], [], [], []];
  private val: Entry[][] = [[], [], [], []];

  constructor(players: PlayerSetup[], seed: number, stage: StageId, glyphs: string[]) {
    this.players = players;
    this.seed = seed;
    this.stage = stage;
    this.glyphs = glyphs;
  }

  /** Log the inputs passed to one step() call. */
  push(inputs: readonly (Input | null | undefined)[]): void {
    for (let s = 0; s < 4; s++) {
      const v: Entry = inputs[s] ?? null;
      const vals = this.val[s]!;
      const prev = vals.length ? vals[vals.length - 1]! : undefined;
      const same = prev !== undefined && (prev === null ? v === null : v !== null && prev.b === v.b && prev.x === v.x && prev.y === v.y);
      if (!same) {
        this.at[s]!.push(this.steps);
        vals.push(v === null ? null : { b: v.b, x: v.x, y: v.y });
      }
    }
    this.steps++;
  }

  start(): Cursor {
    return new Cursor(this, createMatch(this.players, this.seed, { stage: this.stage }));
  }

  inputsAt(step: number, idx: number[]): Entry[] {
    return [0, 1, 2, 3].map((s) => {
      const at = this.at[s]!;
      while (idx[s]! + 1 < at.length && at[idx[s]! + 1]! <= step) idx[s]!++;
      return at.length && at[idx[s]!]! <= step ? this.val[s]![idx[s]!]! : null;
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
