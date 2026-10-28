import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_LIMITS } from "@fpl/shared";
import { connect, type Db } from "../src/db.ts";
import { localStack, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();

/**
 * Accounts, proven from OUTSIDE over HTTP as a browser would reach them
 * (ADR-0008, ADR-0012): each user sees and changes only their own
 * profile and question counter, the counter can only go up, and anonymous
 * visitors reach neither.
 */
describe.skipIf(!stack)(`accounts (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  const rest = (path: string) => `${stack?.apiUrl ?? ""}/rest/v1/${path}`;
  const stamp = Date.now();
  const users: { email: string; token: string; id: string }[] = [];

  async function signUp(email: string): Promise<{ token: string; id: string }> {
    const res = await fetch(`${stack!.apiUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: stack!.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery" }),
    });
    const body = (await res.json()) as { access_token?: string; user?: { id: string } };
    if (!body.access_token || !body.user) throw new Error(`sign-up failed: ${JSON.stringify(body)}`);
    return { token: body.access_token, id: body.user.id };
  }

  const as = (token: string, extra: Record<string, string> = {}) => ({
    apikey: stack!.anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  });
  const rpc = (name: string, token: string, body: unknown = {}) =>
    fetch(rest(`rpc/${name}`), { method: "POST", headers: as(token), body: JSON.stringify(body) });

  beforeAll(async () => {
    for (const who of ["alice", "bob"]) {
      const email = `${who}-${stamp}@accounts-test.dev`;
      users.push({ email, ...(await signUp(email)) });
    }
  });

  afterAll(async () => {
    const db: Db = connect(stack!.dbUrl);
    await db`delete from auth.users where email like ${`%-${stamp}@accounts-test.dev`}`;
    await db.end({ timeout: 5 });
  });

  it("signs up with email and password and no confirmation email", () => {
    expect(users).toHaveLength(2);
    expect(users[0]!.token.split(".")).toHaveLength(3);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await fetch(`${stack!.apiUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: stack!.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `short-${stamp}@accounts-test.dev`, password: "short" }),
    });
    expect(res.ok).toBe(false);
  });

  it("connects a team and reads back only the caller's own profile", async () => {
    const [alice, bob] = users as [typeof users[0], typeof users[0]];
    expect((await rpc("connect_team", alice.token, { p_team_id: 7653564, p_team_name: "abmoh4219", p_manager_name: "Abdelah Aliy" })).ok).toBe(true);
    expect((await rpc("connect_team", bob.token, { p_team_id: 123, p_team_name: "Bob FC", p_manager_name: "Bob" })).ok).toBe(true);

    const mine = (await (await fetch(rest("my_profile?select=*"), { headers: as(alice.token) })).json()) as { user_id: string; fpl_team_id: number }[];
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ user_id: alice.id, fpl_team_id: 7653564 });
  });

  it("changes team by connecting again, without a second row", async () => {
    const alice = users[0]!;
    await rpc("connect_team", alice.token, { p_team_id: 999, p_team_name: "Changed", p_manager_name: "Abdelah Aliy" });
    const mine = (await (await fetch(rest("my_profile?select=fpl_team_id"), { headers: as(alice.token) })).json()) as { fpl_team_id: number }[];
    expect(mine).toEqual([{ fpl_team_id: 999 }]);
  });

  it("anonymous visitors can read no profile and cannot connect a team", async () => {
    const res = await fetch(rest("my_profile?select=*"), { headers: { apikey: stack!.anonKey } });
    expect(res.ok).toBe(false);
    expect((await rpc("connect_team", stack!.anonKey, { p_team_id: 1, p_team_name: "x", p_manager_name: "x" })).ok).toBe(false);
  });

  it("counts questions per account and stops at the lifetime limit", async () => {
    const bob = users[1]!;
    const results: { allowed: boolean; used: number; remaining: number }[] = [];
    for (let i = 0; i < AGENT_LIMITS.questionsPerAccount + 1; i++) {
      const [row] = (await (await rpc("consume_question", bob.token)).json()) as typeof results;
      results.push(row!);
    }
    expect(results[0]).toEqual({ allowed: true, used: 1, remaining: AGENT_LIMITS.questionsPerAccount - 1 });
    expect(results.at(-2)).toMatchObject({ allowed: true, remaining: 0 });
    // The SQL limit and AGENT_LIMITS must agree: one past the limit is refused.
    expect(results.at(-1)).toMatchObject({ allowed: false, used: AGENT_LIMITS.questionsPerAccount + 1 });
  });

  it("never resets: questions from earlier days count towards the same lifetime allowance", async () => {
    const carl = { email: `carl-${stamp}@accounts-test.dev`, ...(await signUp(`carl-${stamp}@accounts-test.dev`)) };
    const db: Db = connect(stack!.dbUrl);
    try {
      // Pretend Carl used all but one of his questions last week.
      await db`insert into app.agent_usage (user_id, day, questions)
               values (${carl.id}, current_date - 7, ${AGENT_LIMITS.questionsPerAccount - 1})`;
    } finally {
      await db.end({ timeout: 5 });
    }
    const total = (await (await fetch(rest("my_usage_total?select=questions"), { headers: as(carl.token) })).json()) as { questions: number }[];
    expect(total[0]!.questions).toBe(AGENT_LIMITS.questionsPerAccount - 1);
    const [last] = (await (await rpc("consume_question", carl.token)).json()) as { allowed: boolean; remaining: number }[];
    expect(last).toMatchObject({ allowed: true, remaining: 0 });
    const [over] = (await (await rpc("consume_question", carl.token)).json()) as { allowed: boolean }[];
    expect(over!.allowed).toBe(false);
  });

  it("keeps each account's counter separate", async () => {
    const alice = users[0]!;
    const [row] = (await (await rpc("consume_question", alice.token)).json()) as { used: number }[];
    expect(row!.used).toBe(1);
  });

  it("never lets a user reset or delete their own counter", async () => {
    const bob = users[1]!;
    const reset = await fetch(rest("agent_usage"), {
      method: "PATCH",
      headers: as(bob.token, { "Content-Profile": "app" }),
      body: JSON.stringify({ questions: 0 }),
    });
    expect(reset.ok).toBe(false); // app is not even an exposed schema

    const db: Db = connect(stack!.dbUrl);
    try {
      // Even with direct SQL as the authenticated role, the trigger refuses a decrease.
      await expect(
        db.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: bob.id, role: "authenticated" })}, true)`;
          await tx`set local role authenticated`;
          await tx`update app.agent_usage set questions = 0 where user_id = ${bob.id}`;
        }),
      ).rejects.toThrow(/only go up/);
    } finally {
      await db.end({ timeout: 5 });
    }
  });

  it("deleting a user removes their profile and usage", async () => {
    const db: Db = connect(stack!.dbUrl);
    try {
      const bob = users[1]!;
      await db`delete from auth.users where id = ${bob.id}`;
      const [counts] = await db<{ p: string; u: string }[]>`
        select (select count(*) from app.profiles where user_id = ${bob.id}) as p,
               (select count(*) from app.agent_usage where user_id = ${bob.id}) as u
      `;
      expect(counts).toEqual({ p: "0", u: "0" });
    } finally {
      await db.end({ timeout: 5 });
    }
  });

  it("anonymous visitors cannot call delete_my_account, nor the elevated function behind it", async () => {
    const anon = { apikey: stack!.anonKey, "Content-Type": "application/json" };
    const res = await fetch(rest("rpc/delete_my_account"), { method: "POST", headers: anon, body: "{}" });
    expect(res.ok).toBe(false);
    // `app` is not exposed by the Data API at all.
    const direct = await fetch(rest("rpc/delete_user"), { method: "POST", headers: anon, body: "{}" });
    expect(direct.ok).toBe(false);
  });

  it("delete_my_account deletes the caller's own login, and nobody else's", async () => {
    const carol = { email: `carol-${stamp}@accounts-test.dev`, ...(await signUp(`carol-${stamp}@accounts-test.dev`)) };
    const dave = { email: `dave-${stamp}@accounts-test.dev`, ...(await signUp(`dave-${stamp}@accounts-test.dev`)) };
    expect((await rpc("connect_team", carol.token, { p_team_id: 7, p_team_name: "C", p_manager_name: "Carol" })).ok).toBe(true);

    expect((await rpc("delete_my_account", carol.token)).ok).toBe(true);

    const db: Db = connect(stack!.dbUrl);
    try {
      const rows = await db<{ email: string }[]>`
        select email from auth.users where email in (${carol.email}, ${dave.email})
      `;
      expect(rows.map((r) => r.email)).toEqual([dave.email]);
      const [left] = await db<{ n: string }[]>`select count(*) as n from app.profiles where user_id = ${carol.id}`;
      expect(left!.n).toBe("0");
    } finally {
      await db.end({ timeout: 5 });
    }
  });
});
