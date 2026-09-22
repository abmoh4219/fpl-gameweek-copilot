import { beforeAll } from "vitest";

/**
 * Tests read from samples/ and must NEVER touch a live API (CLAUDE.md §6).
 * Any stray request fails the test instead of quietly burning a quota.
 */
beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    throw new Error(
      `Network access is disabled in tests. Attempted request: ${String(input)}. ` +
        `Use a file from samples/ instead (refresh with \`pnpm sample\`).`,
    );
  }) as typeof fetch;
});
