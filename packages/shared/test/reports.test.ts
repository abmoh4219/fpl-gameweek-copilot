import { describe, expect, it } from "vitest";
import {
  INSIGHT_CONFIG,
  buildDailyReport,
  buildXPost,
  escapeHtml,
  renderReport,
  splitMessage,
  type PlayerCard,
} from "../src/index.ts";

function card(overrides: Partial<PlayerCard> = {}): PlayerCard {
  return {
    playerId: 1, fplId: 411, webName: "Haaland", team: "MCI", position: "FWD",
    priceM: 15.6, priceChangeEventTenths: 1, ownership: 73.6, netTransfersEvent: 44000,
    totalPoints: 50, epNext: 9.2, status: "a", news: "", chanceOfPlayingNextRound: null,
    minutes: 450, starts: 5, xgiPer90: 0.99,
    form: { gameweeks: 4, points: 37, minutes: 360, starts: 4, xgiPer90: 1.05, score: 90 },
    minutesRisk: { band: "Low", score: 0, reasons: [] },
    fixtures: { horizon: 3, gameweeks: [6, 7, 8], averageDifficulty: 3, adjustedDifficulty: 2.9, blanks: 0, doubles: 0, band: "Medium", fixtures: [] },
    goalThreat: { band: "High", score: 1.1, baseXgiPer90: 1.0, opponent: "LIV", isHome: false, onPenalties: true, isEstimate: true },
    congestion: null,
    setPieces: { penalties: 1, corners: null, freekicks: null },
    ...overrides,
  };
}

const baseInput = {
  date: "2026-09-22",
  gameweek: 6,
  generatedAt: "2026-09-22T06:00:00Z",
  priceChanges: [{ direction: "rise" as const, changeM: 0.1, card: card() }],
  statusChanges: [],
  priceWatch: [],
};

describe("daily report payload", () => {
  it("is structured for a website, not just a text blob", () => {
    const { payload } = buildDailyReport(baseInput);
    expect(payload.version).toBe(1);
    expect(payload.type).toBe("daily");
    expect(Array.isArray(payload.sections)).toBe(true);
    // Every section is typed and addressable.
    for (const section of payload.sections) {
      expect(typeof section.kind).toBe("string");
      expect(typeof section.id).toBe("string");
      expect(Array.isArray(section.items)).toBe(true);
    }
    expect(payload.summary["rises"]).toBe(1);
  });

  it("carries the full player card on each price change, for the site to render", () => {
    const { payload } = buildDailyReport(baseInput);
    const section = payload.sections.find((s) => s.id === "risers");
    expect(section?.kind).toBe("price_changes");
    const item = (section as { items: { card: PlayerCard }[] }).items[0];
    expect(item?.card.form.points).toBe(37);
    expect(item?.card.goalThreat.isEstimate).toBe(true);
  });

  it("labels estimated price moves as estimates", () => {
    const { payload } = buildDailyReport({
      ...baseInput,
      priceWatch: [
        { playerId: 2, fplId: 2, webName: "Riser", teamShortName: "ARS", priceM: 5, priceChangePercent: 95, direction: "rising", isLocked: false },
      ],
    });
    const watch = payload.sections.find((s) => s.id === "watch-risers");
    expect(watch?.note).toMatch(/estimate/i);
    expect(watch?.note).toMatch(/not a confirmed change/i);
  });
});

describe("X post draft", () => {
  it("stays under the character cap", () => {
    const { payload } = buildDailyReport(baseInput);
    expect(payload.xPost.length).toBeLessThanOrEqual(INSIGHT_CONFIG.report.maxXPostChars);
    expect(payload.xPost.length).toBeGreaterThan(0);
  });

  it("leads with a hook and includes concrete numbers", () => {
    const { payload } = buildDailyReport(baseInput);
    const [hook] = payload.xPost.split("\n");
    expect(hook).toMatch(/1 rises, 0 falls/);
    expect(payload.xPost).toContain("Haaland");
    expect(payload.xPost).toContain("15.6");
  });

  it("truncates rather than overflowing when facts are long", () => {
    const long = Array.from({ length: 5 }, (_, i) => `fact number ${i} with a lot of words in it`);
    const post = buildXPost("A hook that is already fairly long by itself.", long, "#FPL");
    expect(post.length).toBeLessThanOrEqual(INSIGHT_CONFIG.report.maxXPostChars);
  });

  it("drops facts that do not fit rather than cutting mid-number", () => {
    const post = buildXPost("Hook.", ["short one", "x".repeat(300)], "#FPL");
    expect(post).toContain("short one");
    expect(post.length).toBeLessThanOrEqual(INSIGHT_CONFIG.report.maxXPostChars);
  });
});

describe("telegram rendering", () => {
  it("escapes HTML so a player name cannot break the message", () => {
    expect(escapeHtml("A & B <script>")).toBe("A &amp; B &lt;script&gt;");
  });

  it("renders a readable message with the headline first", () => {
    const { messages } = buildDailyReport(baseInput);
    expect(messages[0]).toContain("<b>FPL price report — 2026-09-22</b>");
    expect(messages[0]).toContain("Haaland");
  });

  it("omits empty sections instead of printing empty headers", () => {
    const { messages } = buildDailyReport(baseInput);
    expect(messages.join("")).not.toContain("Injury and availability news (0)");
  });

  it("keeps every message inside Telegram's limit", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      direction: "rise" as const,
      changeM: 0.1,
      card: card({ playerId: i, fplId: i, webName: `Player ${i}` }),
    }));
    const { messages } = buildDailyReport({ ...baseInput, priceChanges: many });
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(INSIGHT_CONFIG.report.maxMessageChars);
    }
  });

  it("splits a long report on section boundaries", () => {
    const blocks = [`<b>A</b>\n${"a".repeat(3000)}`, `<b>B</b>\n${"b".repeat(3000)}`];
    const messages = splitMessage(blocks, 4000);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("<b>A</b>");
    expect(messages[1]).toContain("<b>B</b>");
  });

  it("splits an oversized single section rather than dropping it", () => {
    const huge = `<b>Big</b>\n${Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n")}`;
    const messages = splitMessage([huge], 1000);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((m) => m.length <= 1000)).toBe(true);
  });

  it("always returns at least one message", () => {
    const payload = buildDailyReport({ ...baseInput, priceChanges: [] }).payload;
    expect(renderReport(payload).length).toBeGreaterThanOrEqual(1);
  });
});
