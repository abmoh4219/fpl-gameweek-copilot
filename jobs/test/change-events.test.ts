import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectStateChanges, toPlayerState, type DetectedChange, type PlayerState } from "@fpl/shared";
import { connect, type Db } from "../src/db.ts";
import { writeChangeEvents } from "../src/load/change-events.ts";
import { fetchLatestPlayerStates } from "../src/load/player-states.ts";
import { loadSamplesInto } from "../src/load/from-samples.ts";
import type { LoadContext } from "../src/load/context.ts";
import { localStack, SAMPLES_DIR, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();
const ON = "2026-09-23";

describe.skipIf(!stack)(`change events (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;
  let ctx: LoadContext;
  let states: Map<number, PlayerState>;

  beforeAll(async () => {
    db = connect(stack!.dbUrl);
    const outcome = await loadSamplesInto(db, {
      samplesDir: SAMPLES_DIR,
      snapshotDate: "2026-09-22",
      observedAt: new Date("2026-09-22T06:00:00Z"),
    });

    const teams = await db<{ id: string; fpl_id: number }[]>`
      select id, fpl_id from core.teams where season_id = ${outcome.seasonId}
    `;
    const players = await db<{ id: string; fpl_id: number }[]>`
      select id, fpl_id from core.players where season_id = ${outcome.seasonId}
    `;
    ctx = {
      db,
      seasonId: outcome.seasonId,
      teamIds: new Map(teams.map((t) => [Number(t.fpl_id), Number(t.id)])),
      playerIds: new Map(players.map((p) => [Number(p.fpl_id), Number(p.id)])),
      gameweekIds: new Map(),
    };
    states = await fetchLatestPlayerStates(db, outcome.seasonId);
  });

  beforeAll(async () => {
    await db`delete from core.change_events where occurred_on = ${ON}::date`;
  });

  afterAll(async () => {
    await db`delete from core.change_events where occurred_on = ${ON}::date`;
    await db.end({ timeout: 5 });
  });

  async function countFor(type: string): Promise<number> {
    const [row] = await db<{ n: number }[]>`
      select count(*)::int as n from core.change_events
      where occurred_on = ${ON}::date and change_type = ${type}
    `;
    return row!.n;
  }

  function stateOf(fplId: number): PlayerState {
    const state = states.get(fplId);
    if (!state) throw new Error(`no stored state for player ${fplId}`);
    return state;
  }

  it("one synthetic price change creates exactly one price_rise event", async () => {
    const before = stateOf(411); // Haaland
    const change: DetectedChange = {
      dedupKey: `price_rise:${ON}:player:411`,
      changeType: "price_rise",
      playerFplId: 411,
      occurredOn: ON,
      oldValue: { now_cost: before.nowCost },
      newValue: { now_cost: before.nowCost + 1 },
      importance: 225,
    };

    await writeChangeEvents(ctx, [change], null);
    expect(await countFor("price_rise")).toBe(1);
  });

  it("running detection twice creates no duplicates", async () => {
    const before = stateOf(411);
    const change: DetectedChange = {
      dedupKey: `price_rise:${ON}:player:411`,
      changeType: "price_rise",
      playerFplId: 411,
      occurredOn: ON,
      oldValue: { now_cost: before.nowCost },
      newValue: { now_cost: before.nowCost + 1 },
      importance: 225,
    };

    for (let run = 0; run < 3; run++) await writeChangeEvents(ctx, [change], null);
    expect(await countFor("price_rise")).toBe(1);
  });

  it("a -> d then d -> i on the same day produces TWO status events", async () => {
    const base = stateOf(1);
    const first = detectStateChanges(base, { ...base, status: "d" }, ON);
    const second = detectStateChanges({ ...base, status: "d" }, { ...base, status: "i" }, ON);

    await writeChangeEvents(ctx, first, null);
    await writeChangeEvents(ctx, second, null);

    expect(await countFor("status_change")).toBe(2);

    const keys = await db<{ dedup_key: string }[]>`
      select dedup_key from core.change_events
      where occurred_on = ${ON}::date and change_type = 'status_change'
      order by dedup_key
    `;
    expect(keys.map((k) => k.dedup_key)).toEqual([
      `status_change:${ON}:player:1:d`,
      `status_change:${ON}:player:1:i`,
    ]);
  });

  it("unchanged news across many price-sync runs creates zero events", async () => {
    const base = stateOf(40);
    const withNews: PlayerState = { ...base, news: "Knock - 75% chance of playing" };

    // First run: the news appears.
    await writeChangeEvents(ctx, detectStateChanges(base, withNews, ON), null);
    const afterFirst = await countFor("news_change");

    // Eight further runs across the day with the SAME news.
    for (let run = 0; run < 8; run++) {
      const detected = detectStateChanges(withNews, withNews, ON);
      expect(detected).toEqual([]);
      await writeChangeEvents(ctx, detected, null);
    }

    expect(await countFor("news_change")).toBe(afterFirst);
  });

  it("refreshes an unsent event but never one already notified", async () => {
    const key = `ownership_move:${ON}:player:411`;
    const make = (importance: number): DetectedChange => ({
      dedupKey: key,
      changeType: "ownership_move",
      playerFplId: 411,
      occurredOn: ON,
      oldValue: { selected_by_percent: 40 },
      newValue: { selected_by_percent: 42 },
      importance,
    });

    await writeChangeEvents(ctx, [make(100)], null);
    await writeChangeEvents(ctx, [make(200)], null);

    const [unsent] = await db<{ importance: number }[]>`
      select importance from core.change_events where dedup_key = ${key}
    `;
    expect(unsent!.importance).toBe(200); // refreshed while unsent

    // Mark it delivered, as Phase 5 will.
    await db`update core.change_events set notified_at = now() where dedup_key = ${key}`;
    await writeChangeEvents(ctx, [make(300)], null);

    const [sent] = await db<{ importance: number }[]>`
      select importance from core.change_events where dedup_key = ${key}
    `;
    expect(sent!.importance).toBe(200); // untouched after delivery
  });

  it("writes nothing in a dry run", async () => {
    await db`delete from core.change_events where occurred_on = ${ON}::date`;
    const base = stateOf(411);
    const changes = detectStateChanges(base, { ...base, status: "u" }, ON);

    const result = await writeChangeEvents(ctx, changes, null, true);

    expect(result.rows).toBe(changes.length);
    expect(await countFor("status_change")).toBe(0);
  });

  it("derives comparable state identically from a snapshot and from the API", async () => {
    const sample = JSON.parse(
      (await import("node:fs")).readFileSync(`${SAMPLES_DIR}/fpl/bootstrap-static.json`, "utf8"),
    ) as { elements: Record<string, unknown>[] };
    const { BootstrapStaticSchema } = await import("@fpl/shared");
    const bootstrap = BootstrapStaticSchema.parse(sample);

    const haaland = bootstrap.elements.find((e) => e.id === 411)!;
    // Stored state and freshly parsed state must agree, or every run would
    // report phantom changes.
    expect(toPlayerState(haaland)).toEqual(stateOf(411));
  });
});
