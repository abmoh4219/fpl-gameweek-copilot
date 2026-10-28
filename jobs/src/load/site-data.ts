import { siteCards, teamRuns, type SiteCard, type TeamRun } from "@fpl/shared";
import type { Db } from "../db.ts";
import type { EngineInputs } from "../reports/build.ts";
import { chunk, type LoadContext, type LoadResult } from "./context.ts";

/**
 * Publishes what the website renders (ADR-0008): every player card and every
 * team's fixture run, computed by the insight engine, upserted on the natural
 * key. Overwritten each run, so the live set stays ~700 rows.
 */
export async function publishSiteData(
  ctx: LoadContext,
  engine: EngineInputs,
  dryRun = false,
): Promise<LoadResult[]> {
  const cards = siteCards(engine.cards, engine.ticker, engine.strengths);
  const runs = teamRuns(engine.ticker, engine.strengths);

  if (dryRun) {
    return [
      { table: "player_cards", rows: cards.length },
      { table: "team_runs", rows: runs.length },
    ];
  }

  return [
    { table: "player_cards", rows: await upsertCards(ctx.db, cards) },
    { table: "team_runs", rows: await upsertRuns(ctx, runs) },
  ];
}

async function upsertCards(db: Db, cards: readonly SiteCard[]): Promise<number> {
  const rows = cards.map((card) => ({ player_id: card.playerId, card: db.json(card as never) }));
  for (const batch of chunk(rows)) {
    await db`
      insert into core.player_cards ${db(batch, "player_id", "card")}
      on conflict (player_id) do update set card = excluded.card, updated_at = now()
    `;
  }
  return rows.length;
}

async function upsertRuns(ctx: LoadContext, runs: readonly TeamRun[]): Promise<number> {
  const rows = runs.flatMap((run) => {
    const teamId = ctx.teamIds.get(run.teamFplId);
    return teamId === undefined ? [] : [{ team_id: teamId, run: ctx.db.json(run as never) }];
  });
  if (rows.length === 0) return 0;
  await ctx.db`
    insert into core.team_runs ${ctx.db(rows, "team_id", "run")}
    on conflict (team_id) do update set run = excluded.run, updated_at = now()
  `;
  return rows.length;
}
