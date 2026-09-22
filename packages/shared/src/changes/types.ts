/**
 * Change detection is PURE: it takes a previous state and a current state and
 * returns events. Nothing here touches a database, a clock or the network, so
 * every rule is unit-testable against synthetic data.
 */

export type ChangeType =
  | "price_rise"
  | "price_fall"
  | "status_change"
  | "news_change"
  | "ownership_move"
  | "set_piece_change";

/**
 * The slice of a player's state that change detection compares. Built either
 * from a parsed bootstrap element or from a stored snapshot row, so the two
 * are always compared on identical terms.
 */
export interface PlayerState {
  fplId: number;
  webName: string;
  nowCost: number;
  status: string;
  news: string;
  selectedByPercent: number;
  penaltiesOrder: number | null;
  cornersOrder: number | null;
  freekicksOrder: number | null;
}

export interface DetectedChange {
  /** Deterministic: the same change detected twice produces the same key. */
  dedupKey: string;
  changeType: ChangeType;
  playerFplId: number;
  /** UK calendar date, YYYY-MM-DD. */
  occurredOn: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  importance: number;
}
