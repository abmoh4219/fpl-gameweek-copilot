import { afterAll, describe, expect, it } from "vitest";
import { connect } from "../src/db.ts";
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
    "player_cards",
    "team_runs",
    "previews",
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

/**
 * The waitlist is the first user-scoped table (ADR-0008): app schema, RLS
 * policy, security_invoker view. Anyone may join; nobody may read it back.
 */
describe.skipIf(!stack)(`waitlist security (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  const url = (path: string) => `${stack?.apiUrl ?? ""}/rest/v1/${path}`;
  const headers = (): Record<string, string> => ({
    apikey: stack?.anonKey ?? "",
    Authorization: `Bearer ${stack?.anonKey ?? ""}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  });
  const email = `security-test-${Date.now()}@example.com`;
  const join = (body: unknown) =>
    fetch(url("waitlist"), { method: "POST", headers: headers(), body: JSON.stringify(body) });

  afterAll(async () => {
    const db = connect(stack!.dbUrl);
    await db`delete from app.waitlist where email ilike 'security-test-%'`;
    await db.end({ timeout: 5 });
  });

  it("anon CAN join", async () => {
    expect((await join({ email, source: "test" })).status).toBe(201);
  });

  it("rejects the same address twice, whatever its case", async () => {
    expect((await join({ email: email.toUpperCase() })).status).toBe(409);
  });

  it("rejects a malformed address at the RLS policy", async () => {
    expect((await join({ email: "not-an-email" })).ok).toBe(false);
  });

  it("does not let the caller set any other column", async () => {
    expect((await join({ email: `x${email}`, created_at: "2000-01-01" })).ok).toBe(false);
  });

  it("anon CANNOT read the list back", async () => {
    const res = await fetch(url("waitlist?select=email"), { headers: headers() });
    expect(res.ok).toBe(false);
  });

  it("anon CANNOT change or delete a signup", async () => {
    const target = url(`waitlist?email=eq.${encodeURIComponent(email)}`);
    expect((await fetch(target, { method: "PATCH", headers: headers(), body: '{"email":"x@y.zz"}' })).ok).toBe(false);
    expect((await fetch(target, { method: "DELETE", headers: headers() })).ok).toBe(false);
  });

  it("the app schema is not exposed at all", async () => {
    const res = await fetch(url("waitlist?select=email"), {
      headers: { ...headers(), "Accept-Profile": "app" },
    });
    expect(res.ok).toBe(false);
    expect(((await res.json()) as { message?: string }).message ?? "").toMatch(/schema/i);
  });
});
