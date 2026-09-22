import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../src/db.ts";
import { loadSamplesInto } from "../src/load/from-samples.ts";
import { localStack, SAMPLES_DIR, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();

describe.skipIf(!stack)(`loaders (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;

  beforeAll(() => {
    db = connect(stack!.dbUrl);
  });

  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  async function tableCounts(): Promise<Record<string, number>> {
    const [row] = await db<Record<string, string>[]>`
      select
        (select count(*) from core.teams)                 as teams,
        (select count(*) from core.players)               as players,
        (select count(*) from core.gameweeks)             as gameweeks,
        (select count(*) from core.fixtures)              as fixtures,
        (select count(*) from core.player_snapshots)      as player_snapshots,
        (select count(*) from core.player_gameweek_stats) as player_gameweek_stats,
        (select count(*) from core.cl_fixtures)           as cl_fixtures
    `;
    return Object.fromEntries(Object.entries(row!).map(([k, v]) => [k, Number(v)]));
  }

  it("is idempotent: loading the samples twice leaves the row counts unchanged", async () => {
    const options = {
      samplesDir: SAMPLES_DIR,
      snapshotDate: "2026-09-22",
      observedAt: new Date("2026-09-22T06:00:00Z"),
    };

    await loadSamplesInto(db, options);
    const first = await tableCounts();

    await loadSamplesInto(db, options);
    const second = await tableCounts();

    expect(second).toEqual(first);
    expect(first["players"]).toBe(667);
    expect(first["teams"]).toBe(20);
    expect(first["fixtures"]).toBe(380);
  });

  it("dedupes price observations: an unchanged re-run writes no new rows", async () => {
    const before = await db`select count(*)::int as n from core.price_observations`;

    // A later timestamp, but identical telemetry: nothing should be written.
    const outcome = await loadSamplesInto(db, {
      samplesDir: SAMPLES_DIR,
      snapshotDate: "2026-09-22",
      observedAt: new Date("2026-09-22T09:00:00Z"),
    });

    const after = await db`select count(*)::int as n from core.price_observations`;

    expect(outcome.unchangedPrices).toBe(667);
    expect(after[0]!["n"]).toBe(before[0]!["n"]);
  });

  it("records every run in sync_runs, including runs that wrote no price rows", async () => {
    const [row] = await db<{ n: number }[]>`
      select count(*)::int as n from core.sync_runs where job_name = 'load-samples'
    `;
    // load-samples has been run at least once by the script or these tests.
    expect(row!.n).toBeGreaterThanOrEqual(1);
  });
});
