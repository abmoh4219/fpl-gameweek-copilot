import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Db } from "../src/db.ts";
import { loadSamplesInto } from "../src/load/from-samples.ts";
import { localStack, SAMPLES_DIR, SKIP_MESSAGE } from "./local-supabase.ts";

const stack = localStack();

describe.skipIf(!stack)(`insight views (${stack ? "local Supabase" : SKIP_MESSAGE})`, () => {
  let db: Db;

  beforeAll(async () => {
    db = connect(stack!.dbUrl);
    await loadSamplesInto(db, {
      samplesDir: SAMPLES_DIR,
      snapshotDate: "2026-09-22",
      observedAt: new Date("2026-09-22T06:00:00Z"),
    });
  });

  afterAll(async () => {
    await db.end({ timeout: 5 });
  });

  it("player_current has one row per player, with price in GBP m", async () => {
    const [row] = await db<{ n: number; players: number }[]>`
      select
        (select count(*)::int from core.player_current) as n,
        (select count(*)::int from core.players)        as players
    `;
    expect(row!.n).toBe(row!.players);

    const [haaland] = await db<{ price_m: number; now_cost: number }[]>`
      select price_m, now_cost from core.player_current where web_name = 'Haaland'
    `;
    expect(haaland!.price_m).toBeCloseTo(haaland!.now_cost / 10, 5);
  });

  it("price_watch covers every player and never takes direction from the rate", async () => {
    const [row] = await db<{ n: number; bad_direction: number; negative_rate: number }[]>`
      select
        count(*)::int as n,
        count(*) filter (
          where (direction = 'rising'  and price_change_percent <= 0)
             or (direction = 'falling' and price_change_percent >= 0)
        )::int as bad_direction,
        count(*) filter (where hourly_rate_magnitude < 0)::int as negative_rate
      from core.price_watch
    `;
    expect(row!.n).toBe(667);
    expect(row!.bad_direction).toBe(0);
    // The rate is exposed as magnitude only.
    expect(row!.negative_rate).toBe(0);
  });

  it("price_watch keeps the SIGN of the hourly rate as well as its magnitude", async () => {
    const [row] = await db<
      { signed_negative: number; magnitude_negative: number; mismatched: number }[]
    >`
      select
        count(*) filter (where hourly_rate < 0)::int           as signed_negative,
        count(*) filter (where hourly_rate_magnitude < 0)::int as magnitude_negative,
        count(*) filter (where hourly_rate is not null
                           and hourly_rate_magnitude <> abs(hourly_rate))::int as mismatched
      from core.price_watch
    `;
    // The rate is signed in the source data and we no longer throw that away.
    expect(row!.signed_negative).toBeGreaterThan(0);
    expect(row!.magnitude_negative).toBe(0);
    expect(row!.mismatched).toBe(0);
  });

  it("price_watch labels momentum, including players whose signs disagree", async () => {
    const [row] = await db<
      { with_pct: number; against_pct: number; unknown: number; wrong: number }[]
    >`
      select
        count(*) filter (where momentum = 'with')::int    as with_pct,
        count(*) filter (where momentum = 'against')::int as against_pct,
        count(*) filter (where momentum is null)::int     as unknown,
        count(*) filter (
          where (momentum = 'with'
                 and sign(price_change_percent) <> sign(hourly_rate::real))
             or (momentum = 'against'
                 and sign(price_change_percent) = sign(hourly_rate::real))
             or (momentum is not null
                 and (price_change_percent = 0 or hourly_rate = 0))
        )::int as wrong
      from core.price_watch
    `;
    // The disagreeing group is real and sizeable — it is the whole reason the
    // sign is worth keeping (docs/data-dictionary.md, open question 2).
    expect(row!.against_pct).toBeGreaterThan(0);
    expect(row!.with_pct).toBeGreaterThan(0);
    expect(row!.unknown).toBeGreaterThan(0);
    expect(row!.wrong).toBe(0);
  });

  it("momentum never overrides direction, which still comes only from percent", async () => {
    const [row] = await db<{ contradictions: number }[]>`
      select count(*) filter (
        where (price_change_percent > 0 and direction <> 'rising')
           or (price_change_percent < 0 and direction <> 'falling')
      )::int as contradictions
      from core.price_watch
      where momentum = 'against'
    `;
    expect(row!.contradictions).toBe(0);
  });

  it("price_watch likelihood stays in the observed -5..5 band", async () => {
    const [row] = await db<{ out_of_band: number }[]>`
      select count(*) filter (
        where strongest_likelihood is not null
          and (strongest_likelihood < -5 or strongest_likelihood > 5)
      )::int as out_of_band
      from core.price_watch
    `;
    expect(row!.out_of_band).toBe(0);
  });

  it("fixture_ticker covers all 20 teams over the next 5 gameweeks", async () => {
    const [row] = await db<{ teams: number; gws: number; bad_difficulty: number }[]>`
      select
        count(distinct team_id)::int   as teams,
        count(distinct gameweek)::int  as gws,
        count(*) filter (
          where difficulty is not null and (difficulty < 1 or difficulty > 5)
        )::int as bad_difficulty
      from core.fixture_ticker
    `;
    expect(row!.teams).toBe(20);
    expect(row!.gws).toBeLessThanOrEqual(5);
    expect(row!.bad_difficulty).toBe(0);
  });

  it("cl_congestion only ever includes Champions League clubs", async () => {
    const rows = await db<{ team_short_name: string }[]>`
      select distinct team_short_name from core.cl_congestion order by team_short_name
    `;
    const clubs = rows.map((r) => r.team_short_name);
    expect(clubs.length).toBeGreaterThan(0);

    // Every club in the view must actually have a CL fixture on record.
    const [check] = await db<{ orphans: number }[]>`
      select count(*)::int as orphans
      from core.cl_congestion c
      where not exists (
        select 1 from core.cl_fixtures f where f.team_id = c.team_id
      )
    `;
    expect(check!.orphans).toBe(0);
  });

  it("cl_congestion flags both sides of a Champions League match", async () => {
    const [row] = await db<{ after_cl: number; before_cl: number; bad_gap: number }[]>`
      select
        count(*) filter (where is_after_cl)::int  as after_cl,
        count(*) filter (where is_before_cl)::int as before_cl,
        count(*) filter (
          where (is_after_cl and days_since_cl >= 4)
             or (is_before_cl and days_until_cl >= 4)
        )::int as bad_gap
      from core.cl_congestion
    `;
    expect(row!.after_cl).toBeGreaterThan(0);
    expect(row!.before_cl).toBeGreaterThan(0);
    // A flag must never be set for a gap of 4 days or more.
    expect(row!.bad_gap).toBe(0);
  });

  it("player_form aggregates only finished gameweeks", async () => {
    const [row] = await db<{ n: number; over_six: number }[]>`
      select
        count(*)::int as n,
        count(*) filter (where gameweeks_last_6 > 6)::int as over_six
      from core.player_form
    `;
    expect(row!.n).toBeGreaterThan(0);
    expect(row!.over_six).toBe(0);
  });

  describe("price_changes_daily", () => {
    // The samples are a single day, so a second day is synthesised here.
    const NEXT_DAY = "2026-09-23";

    beforeAll(async () => {
      await db`delete from core.player_snapshots where snapshot_date = ${NEXT_DAY}`;
      await db`
        insert into core.player_snapshots (
          player_id, snapshot_date, now_cost, cost_change_event, cost_change_start,
          status, news, news_added, chance_of_playing_next_round,
          chance_of_playing_this_round, selected_by_percent, transfers_in_event,
          transfers_out_event, total_points, event_points, form, points_per_game,
          ep_next, bonus, bps, minutes, starts, goals_scored, assists,
          clean_sheets, goals_conceded, defensive_contribution,
          defensive_contribution_per_90, influence, creativity, threat, ict_index,
          expected_goals, expected_assists, expected_goal_involvements,
          expected_goals_conceded, expected_goals_per_90, expected_assists_per_90,
          expected_goal_involvements_per_90, expected_goals_conceded_per_90,
          penalties_order, corners_and_indirect_freekicks_order, direct_freekicks_order
        )
        select
          s.player_id,
          ${NEXT_DAY}::date,
          case
            when p.web_name = 'Haaland' then s.now_cost + 1   -- riser
            when p.web_name = 'Maatsen' then s.now_cost - 1   -- faller
            else s.now_cost                                   -- unchanged
          end,
          s.cost_change_event, s.cost_change_start, s.status, s.news, s.news_added,
          s.chance_of_playing_next_round, s.chance_of_playing_this_round,
          s.selected_by_percent, s.transfers_in_event, s.transfers_out_event,
          s.total_points, s.event_points, s.form, s.points_per_game, s.ep_next,
          s.bonus, s.bps, s.minutes, s.starts, s.goals_scored, s.assists,
          s.clean_sheets, s.goals_conceded, s.defensive_contribution,
          s.defensive_contribution_per_90, s.influence, s.creativity, s.threat,
          s.ict_index, s.expected_goals, s.expected_assists,
          s.expected_goal_involvements, s.expected_goals_conceded,
          s.expected_goals_per_90, s.expected_assists_per_90,
          s.expected_goal_involvements_per_90, s.expected_goals_conceded_per_90,
          s.penalties_order, s.corners_and_indirect_freekicks_order,
          s.direct_freekicks_order
        from core.player_snapshots s
        join core.players p on p.id = s.player_id
        where s.snapshot_date = '2026-09-22'::date
      `;
    });

    afterAll(async () => {
      await db`delete from core.player_snapshots where snapshot_date = ${NEXT_DAY}`;
    });

    it("reports only the players whose price actually moved", async () => {
      const rows = await db<
        { web_name: string; direction: string; change_tenths: number; change_m: number }[]
      >`
        select web_name, direction, change_tenths, change_m
        from core.price_changes_daily
        where changed_on = ${NEXT_DAY}
        order by web_name
      `;

      expect(rows.map((r) => r.web_name)).toEqual(["Haaland", "Maatsen"]);

      const haaland = rows.find((r) => r.web_name === "Haaland")!;
      expect(haaland.direction).toBe("rise");
      expect(haaland.change_tenths).toBe(1);
      expect(Number(haaland.change_m)).toBeCloseTo(0.1, 5);

      const maatsen = rows.find((r) => r.web_name === "Maatsen")!;
      expect(maatsen.direction).toBe("fall");
      expect(maatsen.change_tenths).toBe(-1);
      expect(Number(maatsen.change_m)).toBeCloseTo(-0.1, 5);
    });
  });
});
