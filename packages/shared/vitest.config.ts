import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Blocks every network call: tests read from samples/ only (CLAUDE.md §6).
    setupFiles: ["./test/setup.ts"],
  },
});
