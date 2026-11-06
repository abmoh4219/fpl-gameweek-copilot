import {
  captainOptions,
  injuryCheck,
  lineupCheck,
  squadPlayerFromCard,
  transferOptions,
  type CaptainOption,
  type InjuryFlag,
  type LineupCheck,
  type SiteCard,
  type Squad,
  type SquadPlayer,
  type TransferSlot,
} from "@fpl/shared";
import { readView } from "./supabase";
import { squadCards } from "./toolkit";

/** Everything the Gaffer panel shows, computed on the server from cached views (ADR-0016). */
export interface GafferData {
  lineup: LineupCheck | null;
  captains: CaptainOption[];
  transfers: TransferSlot[];
  injuries: InjuryFlag[];
  /** The players the transfer options could bring in, ready to draw on the pitch. */
  incoming: Record<number, SquadPlayer>;
}

/**
 * The transfer market: only players a transfer search could ever return
 * (available, with minutes behind them), so the read stays well under the
 * fetch cache's 2 MB item limit. Cached for an hour like the other views; the
 * pipeline refreshes it every three hours.
 */
async function market(): Promise<{ cards: SiteCard[]; teamCodes: Map<number, number> }> {
  const rows = await readView<{ card: SiteCard; team_code: number }>(
    "player_cards",
    "select=card,team_code&card->>status=eq.a&card->form->minutes=gte.180",
    3600,
  );
  const valid = rows.filter((r) => r.card?.version === 1);
  return { cards: valid.map((r) => r.card), teamCodes: new Map(valid.map((r) => [r.card.fplId, r.team_code])) };
}

export async function gafferData(squad: Squad): Promise<GafferData | null> {
  const [owned, { cards, teamCodes }] = await Promise.all([squadCards(squad), market()]);
  if (owned.size === 0) return null;
  // The squad's own cards go in too: an injured player is not in the market but must still be sold.
  const all = [...new Map([...cards, ...owned.values()].map((c) => [c.fplId, c])).values()];
  const transfers = transferOptions(squad, all);
  const ids = new Set(transfers.flatMap((s) => Object.values(s.ideas).flat().map((i) => i.fplId)));
  const incoming: Record<number, SquadPlayer> = {};
  for (const c of cards) if (ids.has(c.fplId)) incoming[c.fplId] = squadPlayerFromCard(c, teamCodes.get(c.fplId) ?? 0);
  return {
    lineup: lineupCheck(squad, owned),
    captains: captainOptions(squad, owned),
    transfers,
    injuries: injuryCheck(squad, owned),
    incoming,
  };
}
