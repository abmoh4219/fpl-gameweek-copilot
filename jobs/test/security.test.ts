import { describe, expect, it } from "vitest";
import { localStack, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();

/**
 * Proves the security model from the OUTSIDE, over HTTP, exactly as a browser
 * would reach it: `anon` can read the api views and cannot touch core at all.
 */
describe.skipIf(!stack)(`Data API security (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  // Resolved lazily: vitest still executes a skipped describe's body while
  // collecting, so nothing here may dereference a null stack.
  const url = (path: string) => `${stack?.apiUrl ?? ""}/rest/v1/${path}`;

  const anonHeaders = (): Record<string, string> => ({
    apikey: stack?.anonKey ?? "",
    Authorization: `Bearer ${stack?.anonKey ?? ""}`,
  });

  it("anon CAN read an api view", async () => {
    const res = await fetch(url("player_current?select=web_name,price_m&limit=3"), {
      headers: anonHeaders(),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { web_name: string; price_m: number }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(3);
    expect(typeof body[0]!.web_name).toBe("string");
  });

  it.each([
    "price_watch",
    "fixture_ticker",
    "price_changes_daily",
    "cl_congestion",
    "player_form",
  ])("anon CAN read api.%s", async (view) => {
    const res = await fetch(url(`${view}?select=*&limit=1`), { headers: anonHeaders });
    expect(res.status).toBe(200);
  });

  it.each([
    "players",
    "player_snapshots",
    "price_observations",
    "change_events",
    "sync_runs",
  ])("anon CANNOT read core.%s", async (table) => {
    const res = await fetch(url(`${table}?select=*&limit=1`), {
      headers: { ...anonHeaders(), "Accept-Profile": "core" },
    });
    expect(res.ok).toBe(false);

    const body = (await res.json()) as { message?: string };
    // core is not an exposed schema at all.
    expect(body.message ?? "").toMatch(/schema/i);
  });

  it("anon CANNOT write to a core table", async () => {
    const res = await fetch(url("seasons"), {
      method: "POST",
      headers: {
        ...anonHeaders,
        "Content-Profile": "core",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "hacked/27" }),
    });
    expect(res.ok).toBe(false);
  });

  it("anon CANNOT write to an api view", async () => {
    const res = await fetch(url("player_current"), {
      method: "POST",
      headers: { ...anonHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ web_name: "hacked" }),
    });
    expect(res.ok).toBe(false);
  });

  it("even the SERVICE ROLE cannot reach core over the Data API", async () => {
    // Jobs use a direct Postgres connection precisely because of this (ADR-0005).
    const res = await fetch(url("players?select=*&limit=1"), {
      headers: {
        apikey: stack?.serviceRoleKey ?? "",
        Authorization: `Bearer ${stack?.serviceRoleKey ?? ""}`,
        "Accept-Profile": "core",
      },
    });
    expect(res.ok).toBe(false);
  });
});
