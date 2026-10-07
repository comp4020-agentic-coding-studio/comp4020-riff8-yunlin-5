import type { StageDef } from "./types.ts";

export type StageId = "riverbank" | "pinecliff";

const riverbank: StageDef = {
  ground: { x1: -320, x2: 320, y: 0 },
  platforms: [
    { x1: -230, x2: -90, y: -110 },
    { x1: 90, x2: 230, y: -110 },
    { x1: -70, x2: 70, y: -210 },
  ],
  blast: { left: -820, right: 820, top: -720, bottom: 420 },
  spawns: [
    { x: -200, y: 0 },
    { x: 200, y: 0 },
    { x: -70, y: 0 },
    { x: 70, y: 0 },
  ],
  respawn: { x: 0, y: -320 },
};

const pinecliff: StageDef = {
  ground: { x1: -230, x2: 230, y: 0 },
  platforms: [
    { x1: -230, x2: -120, y: -80 },
    { x1: -40, x2: 230, y: -150 },
  ],
  blast: { left: -700, right: 700, top: -720, bottom: 420 },
  spawns: [
    { x: -150, y: 0 },
    { x: 150, y: 0 },
    { x: -60, y: 0 },
    { x: 60, y: 0 },
  ],
  respawn: { x: 0, y: -320 },
};

export const STAGES: Record<StageId, StageDef & { id: StageId; name: string }> = {
  riverbank: { id: "riverbank", name: "Riverbank", ...riverbank },
  pinecliff: { id: "pinecliff", name: "Pine cliff", ...pinecliff },
};

export const STAGE = STAGES.riverbank;
