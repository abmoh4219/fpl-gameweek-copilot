/**
 * Refresh the recorded API responses in samples/.
 *
 * MANUAL ONLY — never wired into a cron job. Tests and development read
 * samples/, never the live APIs (CLAUDE.md §6).
 *
 *   pnpm sample
 *
 * Overwrites the existing sample files. Reads config from the repo-root .env.
 * Tokens are never printed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { loadEnv } from "../src/env.ts";
import { errorMessage, fetchJson, sleep, type RateLimit } from "../src/http.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SAMPLES_DIR = path.join(REPO_ROOT, "samples");

const FPL_BASE = "https://fantasy.premierleague.com/api";
const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";

/** FPL is undocumented and unauthenticated — space the calls out. */
const FPL_DELAY_MS = 500;
/** football-data allows 10 req/min: one request per 6s keeps us inside it. */
const FOOTBALL_DATA_DELAY_MS = 6_100;
/** How far ahead to pull Champions League fixtures (covers the next ~5 GWs). */
const CL_WINDOW_DAYS = 45;

/**
 * Just enough of bootstrap-static to drive the rest of the fetch. The real
 * schemas live in packages/shared and are written from these samples.
 */
const DiscoverySchema = z.object({
  events: z.array(
    z.object({
      id: z.number(),
      is_current: z.boolean(),
      finished: z.boolean(),
    }),
  ),
  elements: z.array(
    z.object({
      id: z.number(),
      web_name: z.string(),
      element_type: z.number(),
      selected_by_percent: z.string(),
    }),
  ),
});

interface SampleRecord {
  file: string;
  endpoint: string;
  bytes: number;
}

const written: SampleRecord[] = [];
const skipped: { file: string; reason: string }[] = [];

async function save(relativePath: string, endpoint: string, body: unknown) {
  const full = path.join(SAMPLES_DIR, relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  const json = `${JSON.stringify(body, null, 2)}\n`;
  await writeFile(full, json, "utf8");
  written.push({ file: relativePath, endpoint, bytes: Buffer.byteLength(json) });
  console.log(`  saved ${relativePath} (${formatBytes(json.length)})`);
}

function formatBytes(n: number): string {
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} kB`;
}

async function fetchFpl(endpointPath: string): Promise<unknown> {
  const url = `${FPL_BASE}${endpointPath}`;
  console.log(`  GET ${endpointPath}`);
  const { body } = await fetchJson(url, { browserUserAgent: true });
  await sleep(FPL_DELAY_MS);
  return body;
}

async function fetchFootballData(
  endpointPath: string,
  token: string,
): Promise<{ body: unknown; rateLimit: RateLimit }> {
  const url = `${FOOTBALL_DATA_BASE}${endpointPath}`;
  console.log(`  GET ${endpointPath}`);
  const result = await fetchJson(url, { headers: { "X-Auth-Token": token } });
  if (result.rateLimit.available !== undefined) {
    console.log(
      `    rate limit: ${result.rateLimit.available} left this minute` +
        (result.rateLimit.resetSeconds !== undefined
          ? `, resets in ${result.rateLimit.resetSeconds}s`
          : ""),
    );
  }
  await sleep(FOOTBALL_DATA_DELAY_MS);
  return result;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Highest-owned player of a position. IDs are season-scoped, so never hardcode. */
function topOwned(
  elements: z.infer<typeof DiscoverySchema>["elements"],
  elementType: number,
) {
  const candidates = elements
    .filter((e) => e.element_type === elementType)
    .sort((a, b) => Number(b.selected_by_percent) - Number(a.selected_by_percent));
  return candidates[0];
}

async function main() {
  const env = loadEnv();
  console.log(`Writing samples to ${path.relative(REPO_ROOT, SAMPLES_DIR)}/\n`);

  // ---- FPL ----------------------------------------------------------------
  console.log("FPL API");
  const bootstrap = await fetchFpl("/bootstrap-static/");
  await save("fpl/bootstrap-static.json", "/bootstrap-static/", bootstrap);

  const discovery = DiscoverySchema.parse(bootstrap);

  // events are part of bootstrap-static — extracted, not fetched again.
  await save(
    "fpl/events.json",
    "/bootstrap-static/ (events array, derived — no extra request)",
    discovery.events,
  );

  await save("fpl/fixtures.json", "/fixtures/", await fetchFpl("/fixtures/"));
  await save("fpl/event-status.json", "/event-status/", await fetchFpl("/event-status/"));

  const currentEvent =
    discovery.events.find((e) => e.is_current) ??
    [...discovery.events].reverse().find((e) => e.finished);
  if (!currentEvent) throw new Error("No current or finished gameweek in bootstrap-static");
  console.log(`  current gameweek: ${currentEvent.id}`);

  await save(
    "fpl/event-live.json",
    `/event/${currentEvent.id}/live/`,
    await fetchFpl(`/event/${currentEvent.id}/live/`),
  );

  const picksByPosition = { gk: 1, mid: 3, fwd: 4 } as const;
  const sampledPlayers: Record<string, { id: number; name: string }> = {};
  for (const [label, elementType] of Object.entries(picksByPosition)) {
    const player = topOwned(discovery.elements, elementType);
    if (!player) throw new Error(`No player found for element_type ${elementType}`);
    sampledPlayers[label] = { id: player.id, name: player.web_name };
    console.log(`  ${label}: ${player.web_name} (id ${player.id}, ${player.selected_by_percent}% owned)`);
    await save(
      `fpl/element-summary-${label}.json`,
      `/element-summary/${player.id}/`,
      await fetchFpl(`/element-summary/${player.id}/`),
    );
  }

  await save(
    "fpl/entry.json",
    `/entry/${env.FPL_ENTRY_ID}/`,
    await fetchFpl(`/entry/${env.FPL_ENTRY_ID}/`),
  );

  const lastFinished = [...discovery.events].reverse().find((e) => e.finished);
  if (lastFinished) {
    await save(
      "fpl/entry-picks.json",
      `/entry/${env.FPL_ENTRY_ID}/event/${lastFinished.id}/picks/`,
      await fetchFpl(`/entry/${env.FPL_ENTRY_ID}/event/${lastFinished.id}/picks/`),
    );
  } else {
    skipped.push({ file: "fpl/entry-picks.json", reason: "no finished gameweek yet" });
    console.warn("  skipped entry-picks.json: no finished gameweek yet");
  }

  // ---- football-data.org (optional) ---------------------------------------
  console.log("\nfootball-data.org");
  const clWindow = { from: isoDate(0), to: isoDate(CL_WINDOW_DAYS) };
  if (!env.FOOTBALL_DATA_API_TOKEN) {
    const reason = "FOOTBALL_DATA_API_TOKEN not set";
    skipped.push({ file: "football-data/pl-teams.json", reason });
    skipped.push({ file: "football-data/cl-matches.json", reason });
    console.warn(`  skipped: ${reason} (optional data — not fatal)`);
  } else {
    const token = env.FOOTBALL_DATA_API_TOKEN;
    try {
      const teams = await fetchFootballData("/competitions/PL/teams", token);
      await save("football-data/pl-teams.json", "/competitions/PL/teams", teams.body);

      // CL = Champions League (id 2001). UCL is the Conference League — CLAUDE.md §6.
      const matchesPath =
        `/competitions/CL/matches?dateFrom=${clWindow.from}&dateTo=${clWindow.to}` +
        `&status=SCHEDULED,TIMED`;
      const matches = await fetchFootballData(matchesPath, token);
      await save("football-data/cl-matches.json", matchesPath, matches.body);
    } catch (error) {
      const reason = errorMessage(error);
      skipped.push({ file: "football-data/*", reason });
      console.warn(`  football-data fetch failed: ${reason}`);
      console.warn("  continuing — Champions League data is optional (CLAUDE.md §10)");
    }
  }

  // ---- manifest -----------------------------------------------------------
  const manifest = {
    note: "Generated by `pnpm sample`. Manual only — never run on a schedule.",
    fetchedAt: new Date().toISOString(),
    currentGameweek: currentEvent.id,
    lastFinishedGameweek: lastFinished?.id ?? null,
    sampledPlayers,
    championsLeagueWindow: clWindow,
    files: written,
    skipped,
  };
  await save("manifest.json", "(generated)", manifest);

  console.log(`\nDone: ${written.length} files written, ${skipped.length} skipped.`);
}

main().catch((error) => {
  console.error(`\nfetch-samples failed: ${errorMessage(error)}`);
  process.exit(1);
});
