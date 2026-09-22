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
import { readFileSync } from "node:fs";
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
/**
 * Champions League window.
 *
 * LOOKBACK matters as much as the forward window: the congestion flag has to
 * know about a CL match that was PLAYED recently, otherwise `is_after_cl` can
 * never fire. Recently finished matches are therefore included, not just
 * SCHEDULED/TIMED ones.
 *
 * 35 days, not 7. League-stage matchdays are weeks apart — matchday 1 of
 * 2026/27 ran 8-10 September and matchday 2 not until 13 October, a 33-day
 * gap. A 7-day lookback is enough for the <4 day flag itself, but it leaves
 * `days_since_cl` null for almost every fixture, so the report cannot say how
 * long ago the midweek game was. The window costs the same single request.
 *
 * The forward window covers roughly the next 5 gameweeks, which is as far as
 * the fixture ticker looks.
 */
const CL_LOOKBACK_DAYS = 35;
const CL_WINDOW_DAYS = 45;
const CL_STATUSES = "SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED";

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
  written.push({
    file: relativePath,
    endpoint,
    bytes: Buffer.byteLength(json),
  });
  console.log(`  saved ${relativePath} (${formatBytes(json.length)})`);
}

function formatBytes(n: number): string {
  return n > 1_000_000
    ? `${(n / 1_000_000).toFixed(1)} MB`
    : `${Math.round(n / 1000)} kB`;
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
    .sort(
      (a, b) => Number(b.selected_by_percent) - Number(a.selected_by_percent),
    );
  return candidates[0];
}

/** Which sample groups to refresh. Default: all of them. */
type Target = "fpl" | "fd-teams" | "cl";
const ALL_TARGETS: readonly Target[] = ["fpl", "fd-teams", "cl"];

function selectedTargets(): Set<Target> {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  if (!arg) return new Set(ALL_TARGETS);

  const wanted = arg
    .slice("--only=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = wanted.filter((w) => !ALL_TARGETS.includes(w as Target));
  if (invalid.length > 0) {
    throw new Error(
      `Unknown --only target(s): ${invalid.join(", ")}. Valid targets: ${ALL_TARGETS.join(", ")}`,
    );
  }
  return new Set(wanted as Target[]);
}

interface Manifest {
  currentGameweek: number;
  lastFinishedGameweek: number | null;
  sampledPlayers: Record<string, { id: number; name: string }>;
  championsLeagueWindow?: { from: string; to: string };
  files?: SampleRecord[];
  skipped?: { file: string; reason: string }[];
}

/** A partial refresh must not wipe the rest of the manifest. */
function readExistingManifest(): Manifest | null {
  try {
    return JSON.parse(
      readFileSync(path.join(SAMPLES_DIR, "manifest.json"), "utf8"),
    ) as Manifest;
  } catch {
    return null;
  }
}

async function main() {
  const env = loadEnv();
  const targets = selectedTargets();
  const existing = readExistingManifest();

  console.log(`Writing samples to ${path.relative(REPO_ROOT, SAMPLES_DIR)}/`);
  if (targets.size < ALL_TARGETS.length) {
    console.log(`Partial refresh: ${[...targets].join(", ")}`);
    if (!existing) {
      throw new Error(
        "A partial refresh needs an existing samples/manifest.json. Run a full fetch first.",
      );
    }
  }
  console.log("");

  let currentGameweekId = existing?.currentGameweek ?? 0;
  let lastFinishedId = existing?.lastFinishedGameweek ?? null;
  let sampledPlayers: Record<string, { id: number; name: string }> =
    existing?.sampledPlayers ?? {};

  if (targets.has("fpl")) {
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
    await save(
      "fpl/event-status.json",
      "/event-status/",
      await fetchFpl("/event-status/"),
    );

    const currentEvent =
      discovery.events.find((e) => e.is_current) ??
      [...discovery.events].reverse().find((e) => e.finished);
    if (!currentEvent)
      throw new Error("No current or finished gameweek in bootstrap-static");
    console.log(`  current gameweek: ${currentEvent.id}`);

    await save(
      "fpl/event-live.json",
      `/event/${currentEvent.id}/live/`,
      await fetchFpl(`/event/${currentEvent.id}/live/`),
    );

    const picksByPosition = { gk: 1, mid: 3, fwd: 4 } as const;
    sampledPlayers = {};
    for (const [label, elementType] of Object.entries(picksByPosition)) {
      const player = topOwned(discovery.elements, elementType);
      if (!player)
        throw new Error(`No player found for element_type ${elementType}`);
      sampledPlayers[label] = { id: player.id, name: player.web_name };
      console.log(
        `  ${label}: ${player.web_name} (id ${player.id}, ${player.selected_by_percent}% owned)`,
      );
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

    const lastFinished = [...discovery.events]
      .reverse()
      .find((e) => e.finished);
    if (lastFinished) {
      await save(
        "fpl/entry-picks.json",
        `/entry/${env.FPL_ENTRY_ID}/event/${lastFinished.id}/picks/`,
        await fetchFpl(
          `/entry/${env.FPL_ENTRY_ID}/event/${lastFinished.id}/picks/`,
        ),
      );
    } else {
      skipped.push({
        file: "fpl/entry-picks.json",
        reason: "no finished gameweek yet",
      });
      console.warn("  skipped entry-picks.json: no finished gameweek yet");
    }

    currentGameweekId = currentEvent.id;
    lastFinishedId = lastFinished?.id ?? null;
  } // end FPL

  // ---- football-data.org (optional) ---------------------------------------
  console.log("\nfootball-data.org");
  const clWindow = {
    from: isoDate(-CL_LOOKBACK_DAYS),
    to: isoDate(CL_WINDOW_DAYS),
  };
  if (!targets.has("fd-teams") && !targets.has("cl")) {
    console.log("  skipped: not selected by --only");
  } else if (!env.FOOTBALL_DATA_API_TOKEN) {
    const reason = "FOOTBALL_DATA_API_TOKEN not set";
    skipped.push({ file: "football-data/pl-teams.json", reason });
    skipped.push({ file: "football-data/cl-matches.json", reason });
    console.warn(`  skipped: ${reason} (optional data — not fatal)`);
  } else {
    const token = env.FOOTBALL_DATA_API_TOKEN;
    try {
      if (targets.has("fd-teams")) {
        const teams = await fetchFootballData("/competitions/PL/teams", token);
        await save(
          "football-data/pl-teams.json",
          "/competitions/PL/teams",
          teams.body,
        );
      }

      if (targets.has("cl")) {
        // CL = Champions League (id 2001). UCL is the Conference League — CLAUDE.md §6.
        const matchesPath =
          `/competitions/CL/matches?dateFrom=${clWindow.from}&dateTo=${clWindow.to}` +
          `&status=${CL_STATUSES}`;
        const matches = await fetchFootballData(matchesPath, token);
        await save("football-data/cl-matches.json", matchesPath, matches.body);
      }
    } catch (error) {
      const reason = errorMessage(error);
      skipped.push({ file: "football-data/*", reason });
      console.warn(`  football-data fetch failed: ${reason}`);
      console.warn(
        "  continuing — Champions League data is optional (CLAUDE.md §10)",
      );
    }
  }

  // ---- manifest -----------------------------------------------------------
  // On a partial refresh, keep the entries for files we did not touch.
  const untouched = (existing?.files ?? []).filter(
    (f) => !written.some((w) => w.file === f.file),
  );
  const manifest = {
    note: "Generated by `pnpm sample`. Manual only — never run on a schedule.",
    fetchedAt: new Date().toISOString(),
    refreshed: [...targets],
    currentGameweek: currentGameweekId,
    lastFinishedGameweek: lastFinishedId,
    sampledPlayers,
    championsLeagueWindow: targets.has("cl")
      ? clWindow
      : (existing?.championsLeagueWindow ?? clWindow),
    files: [...untouched, ...written].sort((a, b) =>
      a.file.localeCompare(b.file),
    ),
    skipped,
  };
  await save("manifest.json", "(generated)", manifest);

  console.log(
    `\nDone: ${written.length} files written, ${skipped.length} skipped.`,
  );
}

main().catch((error) => {
  console.error(`\nfetch-samples failed: ${errorMessage(error)}`);
  process.exit(1);
});
