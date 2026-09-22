import type { ChangeType } from "./types.ts";

/**
 * Deterministic dedup keys. The unique constraint on core.change_events makes
 * storing (and therefore sending) the same change twice impossible.
 *
 * The GRANULARITY of a key is a product decision:
 *
 *  - price, ownership and set-piece keys are `type:date:player`, so there is
 *    at most ONE per player per day. Today's snapshot is rewritten throughout
 *    the day, and we do not want a second "price rise" every time it is.
 *
 *  - status keys include the NEW STATUS, because `a -> d` in the morning and
 *    `d -> i` in the afternoon are two genuinely different pieces of news and
 *    both matter before a Friday deadline.
 *
 *  - news keys include a short hash of the new text, for the same reason: an
 *    updated return date is new information.
 */
export function dailyKey(type: ChangeType, occurredOn: string, playerFplId: number): string {
  return `${type}:${occurredOn}:player:${playerFplId}`;
}

export function statusKey(occurredOn: string, playerFplId: number, newStatus: string): string {
  return `status_change:${occurredOn}:player:${playerFplId}:${newStatus}`;
}

export function newsKey(occurredOn: string, playerFplId: number, newNews: string): string {
  return `news_change:${occurredOn}:player:${playerFplId}:${shortHash(newNews)}`;
}

/**
 * FNV-1a, 32-bit, base36. Not cryptographic — it only has to be stable,
 * short, and dependency-free so the browser bundle can use it too.
 */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0").slice(0, 8);
}
