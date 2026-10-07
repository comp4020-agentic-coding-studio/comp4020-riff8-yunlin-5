import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
// room-cap.test.ts fills the shared server's rooms, which would race every
// other file's joins, so it runs alone after the rest have finished.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "spec",
          include: ["spec/**/*.test.ts"],
          exclude: ["spec/room-cap.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: "room-cap",
          include: ["spec/room-cap.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
