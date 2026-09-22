import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BootstrapStaticSchema,
  EventLiveSchema,
  FixturesSchema,
  FootballDataMatchesSchema,
} from "@fpl/shared";

import type { Db } from "../db.ts";
import { errorMessage } from "../http.ts";
import type { LoadContext, LoadResult } from "./context.ts";
import { loadClFixtures } from "./cl-fixtures.ts";
import { loadPlayerGameweekStats } from "./gameweek-stats.ts";
import { loadPriceObservations } from "./price-observations.ts";
import { loadFixtures, loadGameweeks, loadPlayers, loadSeason, loadTeams } from "./reference.ts";
import { loadPlayerSnapshots } from "./snapshots.ts";

/** Bumped by hand each season; samples are season-scoped. */
export const SAMPLE_SEASON = "2026/27";

export interface SampleLoadOptions {
  samplesDir: string;
  /** ISO date (YYYY-MM-DD) for the snapshot row. */
  snapshotDate?: string;
  observedAt?: Date;
  onWarning?: (message: string) => void;
}

export interface SampleLoadOutcome {
  seasonId: number;
  results: LoadResult[];
  /** Players whose price telemetry was unchanged, so no row was written. */
  unchangedPrices: number;
}

/**
 * The one path that turns samples/ into database rows, shared by
 * `pnpm load:samples` and the integration tests, so tests exercise the real
 * loaders rather than a parallel implementation.
 */
export async function loadSamplesInto(
  db: Db,
  options: SampleLoadOptions,
): Promise<SampleLoadOutcome> {
  const read = (relativePath: string): unknown =>
    JSON.parse(readFileSync(path.join(options.samplesDir, relativePath), "utf8"));

  const bootstrap = BootstrapStaticSchema.parse(read("fpl/bootstrap-static.json"));
  const fixtures = FixturesSchema.parse(read("fpl/fixtures.json"));
  const live = EventLiveSchema.parse(read("fpl/event-live.json"));
  const manifest = read("manifest.json") as { currentGameweek: number };

  const snapshotDate = options.snapshotDate ?? new Date().toISOString().slice(0, 10);
  const observedAt = options.observedAt ?? new Date();
  const results: LoadResult[] = [];

  const seasonId = await loadSeason(db, SAMPLE_SEASON);

  const { result: teamResult, teamIds } = await loadTeams(db, seasonId, bootstrap);
  results.push(teamResult);

  const { result: playerResult, playerIds } = await loadPlayers(
    db,
    { db, seasonId, teamIds },
    bootstrap,
  );
  results.push(playerResult);

  const { result: gwResult, gameweekIds } = await loadGameweeks(db, seasonId, bootstrap);
  results.push(gwResult);

  const ctx: LoadContext = { db, seasonId, teamIds, playerIds, gameweekIds };

  results.push(await loadFixtures(ctx, fixtures));
  results.push(await loadPlayerSnapshots(ctx, bootstrap, snapshotDate));

  const priceResult = await loadPriceObservations(ctx, bootstrap, observedAt);
  results.push(priceResult);

  results.push(await loadPlayerGameweekStats(ctx, live, manifest.currentGameweek));

  // Optional data: never fail the run over it (CLAUDE.md §10).
  try {
    const clMatches = FootballDataMatchesSchema.parse(read("football-data/cl-matches.json"));
    results.push(await loadClFixtures(ctx, clMatches));
  } catch (error) {
    options.onWarning?.(`skipped cl_fixtures: ${errorMessage(error)}`);
  }

  return { seasonId, results, unchangedPrices: priceResult.unchanged };
}
