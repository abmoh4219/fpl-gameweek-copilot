import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../src/db.ts";
import { loadSamplesInto } from "../src/load/from-samples.ts";
import { localStack, SAMPLES_DIR, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();

/**
 * Retention is load-bearing, not housekeeping: without it price_observations
 * outgrows the 500 MB free tier inside a season (docs/database.md).
 */
describe.skipIf(!stack)(`price retention (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;
  let playerId: number;

  beforeAll(async () => {
    db = connect(stack!.dbUrl);
    await loadSamplesInto(db, {
      samplesDir: SAMPLES_DIR,
      snapshotDate: "2026-09-22",
      observedAt: new Date("2026-09-22T06:00:00Z"),
    });

    const [player] = await db<{ id: string }[]>`
      select id from core.players where web_name = 'Haaland' limit 1
    `;
    playerId = Number(player!.id);

    // Two old observations on one day, well outside any retention window.
    await db`delete from core.price_observations where observed_at < '2026-01-01'`;
    await db`delete from core.price_observation_daily where observed_on < '2026-01-01'`;
    await db`
      insert into core.price_observations (
        player_id, observed_at, now_cost, price_change_percent,
        price_change_hourly_rate, price_change_projections,
        price_change_locked_until, price_change_calibrating
      ) values
        (${playerId}, '2025-05-01T03:00:00Z', 140, -20.5, -300,
         ${db.json([{ offset: 0, projected_percent: -20.5, likelihood: -2 }] as never)}, null, false),
        (${playerId}, '2025-05-01T21:00:00Z', 141, 44.0, 1200,
         ${db.json([{ offset: 0, projected_percent: 44.0, likelihood: 4 }] as never)}, null, false)
    `;
  });

  afterAll(async () => {
    await db`delete from core.price_observation_daily where observed_on < '2026-01-01'`;
    await db.end({ timeout: 5 });
  });

  it("summarises a day, then deletes its raw rows", async () => {
    const [outcome] = await db<{ summarised_days: number; deleted_rows: string }[]>`
      select * from core.prune_price_observations(60)
    `;
    expect(outcome!.summarised_days).toBeGreaterThanOrEqual(1);
    expect(Number(outcome!.deleted_rows)).toBeGreaterThanOrEqual(2);

    const remaining = await db<{ n: number }[]>`
      select count(*)::int as n from core.price_observations
      where observed_at < '2026-01-01'
    `;
    expect(remaining[0]!.n).toBe(0);
  });

  it("keeps open, close and extremes in the permanent summary", async () => {
    const [summary] = await db<
      {
        observations: number;
        open_cost: number;
        close_cost: number;
        min_percent: number;
        max_percent: number;
        close_percent: number;
        peak_rate_magnitude: number;
        min_rate: number;
        max_rate: number;
        close_rate: number;
        price_changed: boolean;
      }[]
    >`
      select observations, open_cost, close_cost, min_percent, max_percent,
             close_percent, peak_rate_magnitude, min_rate, max_rate, close_rate,
             price_changed
      from core.price_observation_daily
      where player_id = ${playerId} and observed_on = '2025-05-01'
    `;

    expect(summary!.observations).toBe(2);
    expect(summary!.open_cost).toBe(140);
    expect(summary!.close_cost).toBe(141);
    expect(summary!.min_percent).toBeCloseTo(-20.5, 3);
    expect(summary!.max_percent).toBeCloseTo(44.0, 3);
    expect(summary!.close_percent).toBeCloseTo(44.0, 3);
    expect(summary!.peak_rate_magnitude).toBe(1200);
    // The SIGNED extremes are kept too: the rate went from -300 to +1200
    // across the day, which magnitude alone would hide entirely.
    expect(summary!.min_rate).toBe(-300);
    expect(summary!.max_rate).toBe(1200);
    expect(summary!.close_rate).toBe(1200);
    // The price moved 140 -> 141 that day.
    expect(summary!.price_changed).toBe(true);
  });

  it("is idempotent: a second prune changes nothing", async () => {
    const before = await db<{ n: number }[]>`
      select count(*)::int as n from core.price_observation_daily
    `;
    const [outcome] = await db<{ deleted_rows: string }[]>`
      select * from core.prune_price_observations(60)
    `;
    const after = await db<{ n: number }[]>`
      select count(*)::int as n from core.price_observation_daily
    `;

    expect(Number(outcome!.deleted_rows)).toBe(0);
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("leaves rows inside the retention window alone", async () => {
    const [row] = await db<{ n: number }[]>`
      select count(*)::int as n from core.price_observations
    `;
    expect(row!.n).toBeGreaterThan(0);
  });
});
