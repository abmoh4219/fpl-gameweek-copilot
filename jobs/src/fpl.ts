/**
 * Typed FPL and football-data clients.
 *
 * Every response is parsed with the shared Zod schemas. A schema failure is
 * FATAL and names the offending field: if the upstream shape changed, we stop
 * rather than quietly writing wrong numbers.
 */
import {
  BootstrapStaticSchema,
  EventLiveSchema,
  FixturesSchema,
  FootballDataMatchesSchema,
  type BootstrapStatic,
  type EventLive,
  type Fixture,
  type FootballDataMatches,
} from "@fpl/shared";
import type { z } from "zod";

import { fetchJson, sleep } from "./http.ts";

const FPL_BASE = "https://fantasy.premierleague.com/api";
const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";
const FPL_DELAY_MS = 400;

export class SchemaValidationError extends Error {
  constructor(source: string, issues: string) {
    super(`${source} did not match its schema:\n${issues}`);
    this.name = "SchemaValidationError";
  }
}

function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  source: string,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new SchemaValidationError(source, issues);
}

export async function fetchBootstrap(): Promise<BootstrapStatic> {
  const { body } = await fetchJson(`${FPL_BASE}/bootstrap-static/`, {
    browserUserAgent: true,
  });
  return parseOrThrow(BootstrapStaticSchema, body, "bootstrap-static");
}

export async function fetchFixtures(): Promise<Fixture[]> {
  await sleep(FPL_DELAY_MS);
  const { body } = await fetchJson(`${FPL_BASE}/fixtures/`, { browserUserAgent: true });
  return parseOrThrow(FixturesSchema, body, "fixtures");
}

export async function fetchEventLive(gameweek: number): Promise<EventLive> {
  await sleep(FPL_DELAY_MS);
  const { body } = await fetchJson(`${FPL_BASE}/event/${gameweek}/live/`, {
    browserUserAgent: true,
  });
  return parseOrThrow(EventLiveSchema, body, `event/${gameweek}/live`);
}

/**
 * Champions League matches, ONE request.
 *
 * The window looks backward as well as forward and includes FINISHED
 * matches: the congestion flag has to know about a midweek game that was
 * already played, or `is_after_cl` can never fire (CLAUDE.md §6).
 */
export async function fetchClMatches(
  token: string,
  dateFrom: string,
  dateTo: string,
): Promise<FootballDataMatches> {
  const path =
    `/competitions/CL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}` +
    `&status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED`;

  const { body, rateLimit } = await fetchJson(`${FOOTBALL_DATA_BASE}${path}`, {
    headers: { "X-Auth-Token": token },
  });

  if (rateLimit.available !== undefined && rateLimit.available <= 2) {
    console.warn(`  football-data: only ${rateLimit.available} requests left this minute`);
  }

  return parseOrThrow(FootballDataMatchesSchema, body, "football-data CL matches");
}
