import { INSIGHT_CONFIG } from "../insights/config.ts";
import { sectionBlocks, renderReport, splitMessage } from "./render.ts";
import type { BuiltReport, StatusChangeItem } from "./types.ts";

/**
 * What jobs/ POSTs to Make Scenario 1 (ADR-0006).
 *
 * Make only routes: every message is already rendered and already split under
 * Telegram's limit, so the scenario never formats text or loops over players
 * — that is what keeps a run at a handful of credits (CLAUDE.md §4).
 *
 * The shared secret is NOT part of this type. jobs/ adds it at send time, so
 * a payload can be logged or tested without carrying a credential.
 */
export const DELIVERY_PAYLOAD_VERSION = 1;

/** `preview_ai` is a Scenario 2 call: it carries a prompt, not messages. */
export type DeliveryKind = "daily_report" | "news_alert" | "preview" | "preview_ai";

export interface DeliveryPayload {
  version: number;
  kind: Exclude<DeliveryKind, "preview_ai">;
  headline: string;
  /** Telegram HTML, one entry per sendMessage call, in order. */
  messages: string[];
  /** For the owner's chat, never the channel (ADR-0002). Null = none. */
  xDraft: string | null;
  /** change_events this delivery covers, for the audit trail. */
  eventCount: number;
}

/**
 * The daily report is only worth a message when something actually changed.
 * A quiet night sends nothing and costs no credits; the report is still
 * stored, so the website shows it either way.
 */
export function isDailyReportWorthSending(report: BuiltReport): boolean {
  const s = report.payload.summary;
  return (s["rises"] ?? 0) + (s["falls"] ?? 0) + (s["statusChanges"] ?? 0) > 0;
}

export function dailyReportDelivery(report: BuiltReport, eventCount: number): DeliveryPayload {
  return {
    version: DELIVERY_PAYLOAD_VERSION,
    kind: "daily_report",
    headline: report.payload.headline,
    messages: renderReport(report.payload, { includeXDraft: false }),
    xDraft: report.payload.xPost || null,
    eventCount,
  };
}

/**
 * Intraday news alert: injury and availability changes that should not wait
 * for 02:37. Selection is separate from rendering so jobs/ marks exactly the
 * events that went out — anything cut by the cap waits for the daily report.
 */
export function selectNewsAlertItems(items: readonly StatusChangeItem[]): StatusChangeItem[] {
  return [...items]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, INSIGHT_CONFIG.delivery.newsAlertMaxItems);
}

/** No X draft: breaking news is posted from the daily report's draft. */
export function newsAlertDelivery(
  selected: readonly StatusChangeItem[],
  eventCount: number,
): DeliveryPayload {
  const headline = selected.length === 1 ? "FPL team news" : `FPL team news (${selected.length})`;
  const blocks = sectionBlocks(headline, [
    { kind: "status_changes", id: "news-alert", title: "Availability changes", items: [...selected] },
  ]);

  return {
    version: DELIVERY_PAYLOAD_VERSION,
    kind: "news_alert",
    headline,
    messages: splitMessage(blocks, INSIGHT_CONFIG.report.maxMessageChars),
    xDraft: null,
    eventCount,
  };
}

/**
 * The gameweek preview, through the same Scenario 1 as everything else: the
 * AI step happens BEFORE this, in Scenario 2, and code has already validated
 * whatever prose it returned (ADR-0007).
 */
export function previewDelivery(report: BuiltReport): DeliveryPayload {
  return {
    version: DELIVERY_PAYLOAD_VERSION,
    kind: "preview",
    headline: report.payload.headline,
    messages: renderReport(report.payload, { includeXDraft: false }),
    xDraft: report.payload.xPost || null,
    eventCount: 0,
  };
}
