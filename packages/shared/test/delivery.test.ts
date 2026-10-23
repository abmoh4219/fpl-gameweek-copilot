import { describe, expect, it } from "vitest";
import {
  INSIGHT_CONFIG,
  buildDailyReport,
  dailyReportDelivery,
  isDailyReportWorthSending,
  newsAlertDelivery,
  selectNewsAlertItems,
  type StatusChangeItem,
} from "../src/index.ts";

function news(overrides: Partial<StatusChangeItem> = {}): StatusChangeItem {
  return {
    fplId: 411, webName: "Haaland", team: "MCI", position: "FWD", ownership: 73.6,
    previousStatus: "a", status: "d", news: "Hamstring - 50% chance of playing",
    chanceOfPlayingNextRound: 50, minutesRiskBand: "High", importance: 300,
    ...overrides,
  };
}

const quietInput = {
  date: "2026-09-22",
  gameweek: 6,
  generatedAt: "2026-09-22T06:00:00Z",
  priceChanges: [],
  statusChanges: [],
  priceWatch: [],
};

describe("daily report delivery", () => {
  it("sends nothing on a quiet night", () => {
    expect(isDailyReportWorthSending(buildDailyReport(quietInput))).toBe(false);
  });

  it("sends when there is news even without a price change", () => {
    const report = buildDailyReport({ ...quietInput, statusChanges: [news()] });
    expect(isDailyReportWorthSending(report)).toBe(true);
  });

  it("keeps the X draft out of the channel messages and hands it over separately", () => {
    const report = buildDailyReport({ ...quietInput, statusChanges: [news()] });
    const payload = dailyReportDelivery(report, 1);

    expect(payload.kind).toBe("daily_report");
    expect(payload.xDraft).toBe(report.payload.xPost);
    expect(payload.messages.join("\n")).not.toContain("Draft for X");
    // the stored text still carries it
    expect(report.messages.join("\n")).toContain("Draft for X");
  });

  it("keeps every message inside Telegram's limit", () => {
    const many = Array.from({ length: 40 }, (_, i) => news({ fplId: i, webName: `Player ${i}`, news: "x".repeat(200) }));
    const payload = dailyReportDelivery(buildDailyReport({ ...quietInput, statusChanges: many }), 40);
    for (const message of payload.messages) {
      expect(message.length).toBeLessThanOrEqual(INSIGHT_CONFIG.report.maxMessageChars);
    }
  });
});

describe("news alert delivery", () => {
  it("leads with the most important news and respects the item cap", () => {
    const items = Array.from({ length: 9 }, (_, i) => news({ fplId: i, webName: `P${i}`, importance: i * 10 }));
    const selected = selectNewsAlertItems(items);

    expect(selected).toHaveLength(INSIGHT_CONFIG.delivery.newsAlertMaxItems);
    expect(selected[0]?.webName).toBe("P8");
  });

  it("renders one message with no X draft", () => {
    const payload = newsAlertDelivery([news()], 2);
    expect(payload.kind).toBe("news_alert");
    expect(payload.xDraft).toBeNull();
    expect(payload.eventCount).toBe(2);
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]).toContain("Haaland");
  });

  it("escapes HTML in news text", () => {
    const payload = newsAlertDelivery([news({ news: "<script>knock</script>" })], 1);
    expect(payload.messages[0]).not.toContain("<script>");
  });
});

describe("delivery payloads", () => {
  it("never carry the experimental momentum fields or a secret", () => {
    const report = buildDailyReport({ ...quietInput, statusChanges: [news()] });
    for (const payload of [dailyReportDelivery(report, 1), newsAlertDelivery([news()], 1)]) {
      const json = JSON.stringify(payload);
      expect(json).not.toMatch(/momentum|hourly/i);
      expect(json).not.toMatch(/secret/i);
    }
  });
});
