import type { Element } from "../schemas/fpl-bootstrap.ts";
import { dailyKey, newsKey, statusKey } from "./dedup.ts";
import { baseScoreFor, scoreImportance } from "./importance.ts";
import type { DetectedChange, PlayerState } from "./types.ts";

/**
 * Ownership thresholds.
 *
 * Ownership is extremely skewed: the median player is owned by 0.2%, and only
 * 186 of 667 are above 1%. So a single rule cannot work.
 *
 *  - ABSOLUTE catches the mass moves that shift a template squad.
 *  - BREAKOUT catches a differential going 0.4% -> 1.1%: small in points,
 *    huge in relative terms, and exactly what this product exists to spot.
 *
 * The 0.3pp floor on the breakout rule is the noise gate. Without it, every
 * player hovering near 0.1% would fire every single day.
 */
export const OWNERSHIP_ABSOLUTE_THRESHOLD = 1.0;
export const OWNERSHIP_BREAKOUT_FLOOR = 0.3;
export const OWNERSHIP_BREAKOUT_RELATIVE = 0.5;

/** Build the comparable slice of state from a parsed bootstrap element. */
export function toPlayerState(element: Element): PlayerState {
  return {
    fplId: element.id,
    webName: element.web_name,
    nowCost: element.now_cost,
    status: element.status,
    news: element.news,
    selectedByPercent: element.selected_by_percent,
    penaltiesOrder: element.penalties_order,
    cornersOrder: element.corners_and_indirect_freekicks_order,
    freekicksOrder: element.direct_freekicks_order,
  };
}

/**
 * Status and news changes. Run by BOTH jobs.
 *
 * Injury news lands on Thursday and Friday afternoons after press
 * conferences, and deadlines are often Friday evening. Detecting these only
 * at 02:37 UTC would deliver them after the deadline, which is worthless.
 */
export function detectStateChanges(
  previous: PlayerState,
  current: PlayerState,
  occurredOn: string,
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if (previous.status !== current.status) {
    changes.push({
      dedupKey: statusKey(occurredOn, current.fplId, current.status),
      changeType: "status_change",
      playerFplId: current.fplId,
      occurredOn,
      oldValue: { status: previous.status, news: previous.news },
      newValue: { status: current.status, news: current.news },
      importance: scoreImportance(
        baseScoreFor("status_change", previous.status, current.status),
        current.selectedByPercent,
      ),
    });
  }

  // Compare the TEXT only: news_added moves without the wording changing.
  if (previous.news !== current.news) {
    changes.push({
      dedupKey: newsKey(occurredOn, current.fplId, current.news),
      changeType: "news_change",
      playerFplId: current.fplId,
      occurredOn,
      oldValue: { news: previous.news },
      newValue: { news: current.news },
      importance: scoreImportance(
        baseScoreFor("news_change", previous.status, current.status),
        current.selectedByPercent,
      ),
    });
  }

  return changes;
}

/**
 * Price, ownership and set-piece changes. Run by daily-sync ONLY.
 *
 * These are day-over-day comparisons by definition — a price rise happens
 * once, at the nightly update — so running them every 3 hours would only
 * produce the same event against a partially updated snapshot.
 */
export function detectDailyChanges(
  previous: PlayerState,
  current: PlayerState,
  occurredOn: string,
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if (previous.nowCost !== current.nowCost) {
    const type = current.nowCost > previous.nowCost ? "price_rise" : "price_fall";
    changes.push({
      dedupKey: dailyKey(type, occurredOn, current.fplId),
      changeType: type,
      playerFplId: current.fplId,
      occurredOn,
      oldValue: { now_cost: previous.nowCost },
      newValue: { now_cost: current.nowCost },
      importance: scoreImportance(
        baseScoreFor(type, previous.status, current.status),
        current.selectedByPercent,
      ),
    });
  }

  if (isOwnershipMove(previous.selectedByPercent, current.selectedByPercent)) {
    changes.push({
      dedupKey: dailyKey("ownership_move", occurredOn, current.fplId),
      changeType: "ownership_move",
      playerFplId: current.fplId,
      occurredOn,
      oldValue: { selected_by_percent: previous.selectedByPercent },
      newValue: { selected_by_percent: current.selectedByPercent },
      importance: scoreImportance(
        baseScoreFor("ownership_move", previous.status, current.status),
        current.selectedByPercent,
      ),
    });
  }

  if (
    previous.penaltiesOrder !== current.penaltiesOrder ||
    previous.cornersOrder !== current.cornersOrder ||
    previous.freekicksOrder !== current.freekicksOrder
  ) {
    changes.push({
      dedupKey: dailyKey("set_piece_change", occurredOn, current.fplId),
      changeType: "set_piece_change",
      playerFplId: current.fplId,
      occurredOn,
      oldValue: {
        penalties_order: previous.penaltiesOrder,
        corners_order: previous.cornersOrder,
        freekicks_order: previous.freekicksOrder,
      },
      newValue: {
        penalties_order: current.penaltiesOrder,
        corners_order: current.cornersOrder,
        freekicks_order: current.freekicksOrder,
      },
      importance: scoreImportance(
        baseScoreFor("set_piece_change", previous.status, current.status),
        current.selectedByPercent,
      ),
    });
  }

  return changes;
}

export function isOwnershipMove(previous: number, current: number): boolean {
  const delta = Math.abs(current - previous);
  if (delta >= OWNERSHIP_ABSOLUTE_THRESHOLD) return true;
  if (delta < OWNERSHIP_BREAKOUT_FLOOR) return false;

  // A player arriving from literally zero ownership is always a breakout.
  const relative = previous > 0 ? delta / previous : Number.POSITIVE_INFINITY;
  return relative >= OWNERSHIP_BREAKOUT_RELATIVE;
}

/** Everything daily-sync detects: state changes plus the day-over-day ones. */
export function detectAllChanges(
  previousDaily: PlayerState,
  previousState: PlayerState,
  current: PlayerState,
  occurredOn: string,
): DetectedChange[] {
  return [
    ...detectStateChanges(previousState, current, occurredOn),
    ...detectDailyChanges(previousDaily, current, occurredOn),
  ];
}
