import { INSIGHT_CONFIG } from "../insights/config.ts";
import type { PlayerCard } from "../insights/index.ts";
import type { ReportPayload, ReportSection } from "./types.ts";

/**
 * Telegram rendering, HTML parse mode.
 *
 * Telegram's HTML mode allows a small tag set only, so everything else must be
 * escaped or it rejects the whole message.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Appended under every AI-written paragraph. */
export const AI_PROSE_LABEL = "Summary written by AI from the computed numbers below. Every pick is an estimate.";

export interface RenderOptions {
  /**
   * Append the X draft as a final block. True for the stored text; false for
   * the public channel, where the draft would be noise (ADR-0002 sends it to
   * the owner's chat instead).
   */
  includeXDraft?: boolean;
}

export function renderReport(payload: ReportPayload, options: RenderOptions = {}): string[] {
  const blocks = sectionBlocks(payload.headline, payload.sections);
  if (payload.prose) {
    // The label is code, not model output: it is always there.
    blocks.splice(1, 0, `${escapeHtml(payload.prose)}\n<i>${AI_PROSE_LABEL}</i>`);
  }

  if (payload.xPost && (options.includeXDraft ?? true)) {
    blocks.push(`<b>Draft for X</b>\n<code>${escapeHtml(payload.xPost)}</code>`);
  }

  return splitMessage(blocks, INSIGHT_CONFIG.report.maxMessageChars);
}

/** Headline plus every non-empty section, as Telegram HTML blocks. */
export function sectionBlocks(headline: string, sections: readonly ReportSection[]): string[] {
  const blocks: string[] = [`<b>${escapeHtml(headline)}</b>`];
  for (const section of sections) {
    const rendered = renderSection(section);
    if (rendered) blocks.push(rendered);
  }
  return blocks;
}

function renderSection(section: ReportSection): string | null {
  if (section.items.length === 0) return null;

  const header = `<b>${escapeHtml(section.title)}</b>` + (section.note ? `\n<i>${escapeHtml(section.note)}</i>` : "");
  const lines: string[] = [];

  switch (section.kind) {
    case "price_changes":
      for (const item of section.items) {
        const arrow = item.direction === "rise" ? "▲" : "▼";
        lines.push(
          `${arrow} <b>${escapeHtml(item.webName)}</b> (${escapeHtml(item.team)}, ${item.position}) ` +
            `£${item.priceM.toFixed(1)}m  ${item.changeM > 0 ? "+" : ""}${item.changeM.toFixed(1)}`,
        );
        lines.push(`   ${escapeHtml(cardLine(item.card))}`);
      }
      break;

    case "status_changes":
      for (const item of section.items) {
        const chance = item.chanceOfPlayingNextRound === null ? "no update" : `${item.chanceOfPlayingNextRound}% chance`;
        lines.push(
          `• <b>${escapeHtml(item.webName)}</b> (${escapeHtml(item.team)}) ` +
            `${escapeHtml(statusLabel(item.status))} — ${chance}, ${item.ownership.toFixed(1)}% owned`,
        );
        if (item.news) lines.push(`   <i>${escapeHtml(item.news)}</i>`);
      }
      break;

    case "price_watch":
      for (const item of section.items) {
        const arrow = item.direction === "rising" ? "▲" : "▼";
        lines.push(
          `${arrow} <b>${escapeHtml(item.webName)}</b> (${escapeHtml(item.team)}) ` +
            `£${item.priceM.toFixed(1)}m — ${item.percent.toFixed(1)}%${item.isLocked ? " (locked)" : ""}`,
        );
      }
      break;

    case "captains":
    case "differentials":
      section.items.forEach((item, index) => {
        lines.push(
          `${index + 1}. <b>${escapeHtml(item.webName)}</b> (${escapeHtml(item.team)}, ${item.position}) ` +
            `£${item.priceM.toFixed(1)}m`,
        );
        lines.push(`   ${escapeHtml(item.reason)}`);
      });
      break;

    case "fixture_swings":
      for (const item of section.items) {
        const runs = item.fixtures
          .map((f) => `${f.opponent ?? "BLANK"}${f.isHome ? " (H)" : f.isHome === false ? " (A)" : ""}`)
          .join(", ");
        lines.push(
          `• <b>${escapeHtml(item.team)}</b> — ${escapeHtml(item.band)} (${item.adjustedDifficulty.toFixed(2)})`,
        );
        lines.push(`   ${escapeHtml(runs)}`);
      }
      break;

    case "congestion":
      for (const item of section.items) {
        const bits: string[] = [];
        if (item.isAfterCl && item.daysSinceCl !== null) bits.push(`${item.daysSinceCl.toFixed(1)}d after CL`);
        if (item.isBeforeCl && item.daysUntilCl !== null) bits.push(`${item.daysUntilCl.toFixed(1)}d before CL`);
        lines.push(`• <b>${escapeHtml(item.team)}</b> GW${item.gameweek} — ${escapeHtml(bits.join(", "))}`);
      }
      break;
  }

  return `${header}\n${lines.join("\n")}`;
}

function cardLine(card: PlayerCard): string {
  const parts = [
    `${card.form.points} pts / 4GW`,
    `${card.xgiPer90.toFixed(2)} xGI/90`,
    `${card.minutesRisk.band} minutes risk`,
    `${card.fixtures.band} run`,
    `${card.goalThreat.band} threat`,
  ];
  if (card.netTransfersEvent !== 0) {
    parts.push(`${card.netTransfersEvent > 0 ? "+" : ""}${formatCount(card.netTransfersEvent)} net`);
  }
  if (card.congestion?.isAfterCl || card.congestion?.isBeforeCl) parts.push("CL congestion");
  return parts.join(" · ");
}

export function statusLabel(status: string): string {
  return (
    {
      a: "available",
      d: "doubtful",
      i: "injured",
      s: "suspended",
      u: "unavailable",
      n: "not in squad",
    }[status] ?? status
  );
}

export function formatCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

/**
 * Splits on SECTION boundaries so a message never ends mid-player. A single
 * oversized section is split on line boundaries as a fallback.
 */
export function splitMessage(blocks: readonly string[], maxChars: number): string[] {
  const messages: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) messages.push(current.trim());
    current = "";
  };

  for (const block of blocks) {
    for (const piece of block.length > maxChars ? splitLines(block, maxChars) : [block]) {
      if (current.length + piece.length + 2 > maxChars) push();
      current += (current ? "\n\n" : "") + piece;
    }
  }
  push();

  return messages.length > 0 ? messages : [""];
}

function splitLines(block: string, maxChars: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const line of block.split("\n")) {
    if (current.length + line.length + 1 > maxChars) {
      out.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) out.push(current);
  return out;
}
