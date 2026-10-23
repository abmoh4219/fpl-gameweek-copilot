import type { PlayerCard, PriceWatchPick, RankedPick } from "../insights/index.ts";

/**
 * Report payloads are STRUCTURED, not a text blob: the Next.js site renders
 * these sections directly, and the Telegram text is one rendering of the same
 * data rather than the source of truth.
 *
 * `version` exists so the site can refuse a payload shape it does not know.
 */
export const REPORT_PAYLOAD_VERSION = 1;

export interface PriceChangeItem {
  fplId: number;
  webName: string;
  team: string;
  position: string;
  priceM: number;
  changeM: number;
  direction: "rise" | "fall";
  card: PlayerCard;
}

export interface StatusChangeItem {
  fplId: number;
  webName: string;
  team: string;
  position: string;
  ownership: number;
  previousStatus: string | null;
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
  minutesRiskBand: string;
  importance: number;
}

export interface FixtureSwingItem {
  teamFplId: number;
  team: string;
  band: string;
  adjustedDifficulty: number;
  blanks: number;
  doubles: number;
  fixtures: { gameweek: number; opponent: string | null; isHome: boolean | null; difficulty: number | null }[];
}

export interface CongestionItem {
  team: string;
  gameweek: number;
  isAfterCl: boolean;
  isBeforeCl: boolean;
  daysSinceCl: number | null;
  daysUntilCl: number | null;
}

/**
 * A discriminated union so the website can switch on `kind` and render each
 * section with a typed component.
 */
export type ReportSection =
  | { kind: "price_changes"; id: string; title: string; note?: string; items: PriceChangeItem[] }
  | { kind: "status_changes"; id: string; title: string; note?: string; items: StatusChangeItem[] }
  | { kind: "price_watch"; id: string; title: string; note: string; items: PriceWatchPick[] }
  | { kind: "captains"; id: string; title: string; note: string; items: RankedPick[] }
  | { kind: "differentials"; id: string; title: string; note: string; items: RankedPick[] }
  | { kind: "fixture_swings"; id: string; title: string; note?: string; items: FixtureSwingItem[] }
  | { kind: "congestion"; id: string; title: string; note: string; items: CongestionItem[] };

export interface ReportPayload {
  version: number;
  type: "daily" | "preview";
  /** UK calendar date the report describes. */
  date: string;
  gameweek: number | null;
  generatedAt: string;
  headline: string;
  /** Counts the site can show without walking the sections. */
  summary: Record<string, number>;
  sections: ReportSection[];
  /**
   * Short AI-written prose around the computed sections (previews only).
   * Absent on template reports. Validated by code before it is stored: it may
   * not contain a number that is not in the facts it was given (ADR-0007).
   */
  prose?: string;
  /**
   * Draft post for X, published MANUALLY (ADR-0002). Kept in the payload so
   * the site and Telegram can both surface it for copying.
   */
  xPost: string;
}

export interface BuiltReport {
  payload: ReportPayload;
  /** Rendered Telegram message(s), already split to fit the API limit. */
  messages: string[];
}
