import { expect, it } from "vitest";
import { MAX_RECORDING_BYTES, Recording } from "../src/net/replay.ts";

const mk = (cap?: number) => new Recording([{ slot: 0, fighter: "wanderer" }], 1, "riverbank", ["記"], cap);

it("stores input changes compactly and reads back exactly what was pushed", () => {
  const r = mk();
  const seq = [
    [{ b: 0, x: 0, y: 0 }, null],
    [{ b: 0, x: 0, y: 0 }, null],
    [{ b: 15, x: -100, y: 100 }, { b: 2, x: 7, y: -3 }],
    [null, { b: 2, x: 7, y: -3 }],
  ];
  for (const inputs of seq) expect(r.push(inputs)).toBe(true);
  expect(r.bytes).toBe(7 * 8); // slot 0: 3 changes, slot 1: 2 (a repeat is collapsed), slots 2 and 3: one null each
  const idx = [0, 0, 0, 0];
  const got = [0, 1, 2, 3].map((t) => r.inputsAt(t, idx).slice(0, 2));
  expect(got).toEqual(seq);
});

it("refuses to grow past its byte cap, and the worst real match fits under the default", () => {
  const r = mk(1000);
  let ok = true;
  for (let t = 0; t < 1000 && ok; t++) ok = r.push([{ b: 0, x: t % 200 - 100, y: 0 }]);
  expect(ok).toBe(false);
  expect(r.bytes).toBeLessThanOrEqual(1000);

  // 120 countdown + 14400 fight ticks, four slots changing every tick, 8 bytes per change.
  expect((120 + 4 * 60 * 60) * 4 * 8).toBeLessThan(MAX_RECORDING_BYTES);
});
