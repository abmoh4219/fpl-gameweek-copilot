import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These are integration tests against one shared local database, so they
    // must not run concurrently with each other.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
