import {
  captainOptions,
  injuryCheck,
  lineupCheck,
  squadPlayerFromCard,
  transferOptions,
  type CaptainOption,
  type InjuryFlag,
  type LineupCheck,
  type Squad,
  type SquadPlayer,
  type TransferSlot,
} from "@fpl/shared";
import { allCards } from "./cards";
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

export async function gafferData(squad: Squad): Promise<GafferData | null> {
  // Both come from the one shared read of every card: no per-team database read.
  const [owned, every] = await Promise.all([squadCards(squad), allCards()]);
  if (owned.size === 0) return null;
  const transfers = transferOptions(squad, [...every.values()].map((r) => r.card));
  const ids = new Set(transfers.flatMap((s) => Object.values(s.ideas).flat().map((i) => i.fplId)));
  const incoming: Record<number, SquadPlayer> = {};
  for (const id of ids) {
    const row = every.get(id);
    if (row) incoming[id] = squadPlayerFromCard(row.card, row.teamCode);
  }
  return {
    lineup: lineupCheck(squad, owned),
    captains: captainOptions(squad, owned),
    transfers,
    injuries: injuryCheck(squad, owned),
    incoming,
  };
}
