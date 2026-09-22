import type { BootstrapStatic } from "@fpl/shared";
import { chunk, type LoadContext, type LoadResult } from "./context.ts";

/**
 * Price telemetry, DEDUPED: a row is written only when something differs from
 * that player's most recent row. Around 400 players sit at zero percent and
 * zero rate for days at a time, and storing those unchanged rows every run
 * would outgrow the 500 MB free tier inside a season (docs/database.md).
 *
 * Nothing is lost: every run is recorded in core.sync_runs, so "no new row"
 * means "unchanged since the row before it".
 */

interface LatestObservation {
  player_id: string;
  now_cost: number;
  price_change_percent: number | null;
  price_change_hourly_rate: number | null;
  price_change_projections: unknown;
  price_change_locked_until: Date | null;
  price_change_calibrating: boolean | null;
}

export interface PriceObservationLoadResult extends LoadResult {
  /** Players whose telemetry was unchanged, so no row was written. */
  unchanged: number;
}

export async function loadPriceObservations(
  ctx: LoadContext,
  bootstrap: BootstrapStatic,
  observedAt: Date,
  dryRun = false,
): Promise<PriceObservationLoadResult> {
  const latest = await ctx.db<LatestObservation[]>`
    select distinct on (player_id)
      player_id, now_cost, price_change_percent, price_change_hourly_rate,
      price_change_projections, price_change_locked_until, price_change_calibrating
    from core.price_observations
    order by player_id, observed_at desc
  `;
  const byPlayer = new Map(latest.map((r) => [Number(r.player_id), r]));

  const rows: Record<string, unknown>[] = [];
  let unchanged = 0;

  for (const e of bootstrap.elements) {
    const playerId = ctx.playerIds.get(e.id);
    if (playerId === undefined) throw new Error(`Unknown player ${e.id} (${e.web_name})`);

    const candidate = {
      player_id: playerId,
      observed_at: observedAt,
      now_cost: e.now_cost,
      price_change_percent: e.price_change_percent ?? null,
      price_change_hourly_rate: e.price_change_hourly_rate ?? null,
      price_change_projections: e.price_change_projections ?? null,
      price_change_locked_until: e.price_change_locked_until ?? null,
      price_change_calibrating: e.price_change_calibrating ?? null,
    };

    if (isUnchanged(byPlayer.get(playerId), candidate)) {
      unchanged++;
      continue;
    }
    rows.push({
      ...candidate,
      // db.json() marks this as jsonb. A plain JSON.stringify would be stored
      // as a jsonb STRING SCALAR, and jsonb_array_elements would then fail.
      price_change_projections: candidate.price_change_projections
        ? ctx.db.json(candidate.price_change_projections as never)
        : null,
    });
  }

  if (dryRun) return { table: "price_observations", rows: rows.length, unchanged };

  for (const batch of chunk(rows)) {
    await ctx.db`
      insert into core.price_observations ${ctx.db(
        batch,
        "player_id", "observed_at", "now_cost", "price_change_percent",
        "price_change_hourly_rate", "price_change_projections",
        "price_change_locked_until", "price_change_calibrating",
      )}
      on conflict (player_id, observed_at) do nothing
    `;
  }

  return { table: "price_observations", rows: rows.length, unchanged };
}

function isUnchanged(
  previous: LatestObservation | undefined,
  candidate: {
    now_cost: number;
    price_change_percent: number | null;
    price_change_hourly_rate: number | null;
    price_change_projections: unknown;
    price_change_locked_until: string | null;
    price_change_calibrating: boolean | null;
  },
): boolean {
  if (previous === undefined) return false;
  return (
    previous.now_cost === candidate.now_cost &&
    nearlyEqual(previous.price_change_percent, candidate.price_change_percent) &&
    previous.price_change_hourly_rate === candidate.price_change_hourly_rate &&
    previous.price_change_calibrating === candidate.price_change_calibrating &&
    sameTimestamp(previous.price_change_locked_until, candidate.price_change_locked_until) &&
    canonicalProjections(previous.price_change_projections) ===
      canonicalProjections(candidate.price_change_projections)
  );
}

/**
 * jsonb does not preserve key order, so a round-tripped projections array
 * never matches JSON.stringify of the original. Compare the values instead.
 */
function canonicalProjections(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      const p = entry as Record<string, unknown>;
      return `${String(p["offset"])}:${String(p["projected_percent"])}:${String(p["likelihood"])}`;
    })
    .join("|");
}

/** Stored as float4, so a round-trip can shift the last bit. */
function nearlyEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-4;
}

function sameTimestamp(a: Date | null, b: string | null): boolean {
  if (a === null || b === null) return (a === null) === (b === null);
  return a.getTime() === new Date(b).getTime();
}
