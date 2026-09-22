import { describe, expect, it } from "vitest";
import {
  BASE_SCORES,
  detectAllChanges,
  detectDailyChanges,
  detectStateChanges,
  isOwnershipMove,
  ownershipWeight,
  scoreImportance,
  shortHash,
  statusRank,
  type PlayerState,
} from "../src/index.ts";

const ON = "2026-09-23";

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    fplId: 411,
    webName: "Haaland",
    nowCost: 150,
    status: "a",
    news: "",
    selectedByPercent: 40,
    penaltiesOrder: 1,
    cornersOrder: null,
    freekicksOrder: null,
    ...overrides,
  };
}

describe("no change, no events", () => {
  it("returns nothing when the state is identical", () => {
    const p = player();
    expect(detectStateChanges(p, { ...p }, ON)).toEqual([]);
    expect(detectDailyChanges(p, { ...p }, ON)).toEqual([]);
    expect(detectAllChanges(p, p, { ...p }, ON)).toEqual([]);
  });

  it("ignores fields it does not watch", () => {
    const before = player();
    const after = player({ webName: "Erling H." });
    expect(detectAllChanges(before, before, after, ON)).toEqual([]);
  });
});

describe("price changes", () => {
  it("detects a rise", () => {
    const [event] = detectDailyChanges(player(), player({ nowCost: 151 }), ON);
    expect(event!.changeType).toBe("price_rise");
    expect(event!.dedupKey).toBe("price_rise:2026-09-23:player:411");
    expect(event!.oldValue).toEqual({ now_cost: 150 });
    expect(event!.newValue).toEqual({ now_cost: 151 });
  });

  it("detects a fall, and scores it above a rise for the same player", () => {
    const [fall] = detectDailyChanges(player(), player({ nowCost: 149 }), ON);
    const [rise] = detectDailyChanges(player(), player({ nowCost: 151 }), ON);
    expect(fall!.changeType).toBe("price_fall");
    expect(fall!.importance).toBeGreaterThan(rise!.importance);
  });
});

describe("status changes", () => {
  it("includes the NEW STATUS in the key, so a->d then d->i are two events", () => {
    const [first] = detectStateChanges(player(), player({ status: "d" }), ON);
    const [second] = detectStateChanges(player({ status: "d" }), player({ status: "i" }), ON);

    expect(first!.dedupKey).toBe("status_change:2026-09-23:player:411:d");
    expect(second!.dedupKey).toBe("status_change:2026-09-23:player:411:i");
    expect(first!.dedupKey).not.toBe(second!.dedupKey);
  });

  it("scores a worsening status above a recovery", () => {
    const [worse] = detectStateChanges(player(), player({ status: "i" }), ON);
    const [better] = detectStateChanges(player({ status: "i" }), player({ status: "a" }), ON);
    expect(worse!.importance).toBeGreaterThan(better!.importance);
  });

  it("ranks availability so suspension counts as badly as injury", () => {
    expect(statusRank("a")).toBeLessThan(statusRank("d"));
    expect(statusRank("i")).toBe(statusRank("s"));
    expect(statusRank("u")).toBeGreaterThan(statusRank("i"));
  });
});

describe("news changes", () => {
  it("keys on a hash of the new text", () => {
    const [event] = detectStateChanges(
      player(),
      player({ news: "Knock - 75% chance of playing" }),
      ON,
    );
    expect(event!.changeType).toBe("news_change");
    expect(event!.dedupKey).toBe(
      `news_change:2026-09-23:player:411:${shortHash("Knock - 75% chance of playing")}`,
    );
  });

  it("gives a different key when the text is updated", () => {
    const [first] = detectStateChanges(player(), player({ news: "Knock - 75% chance" }), ON);
    const [second] = detectStateChanges(
      player({ news: "Knock - 75% chance" }),
      player({ news: "Knock - expected back 03 Oct" }),
      ON,
    );
    expect(first!.dedupKey).not.toBe(second!.dedupKey);
  });

  it("produces NO event across repeated runs when the news is unchanged", () => {
    const before = player({ news: "Knock - 75% chance of playing" });
    const after = player({ news: "Knock - 75% chance of playing" });
    // Simulates price-sync running every 3 hours against static news.
    for (let run = 0; run < 8; run++) {
      expect(detectStateChanges(before, after, ON)).toEqual([]);
    }
  });

  it("fires when news clears, which is how a recovery reads", () => {
    const [event] = detectStateChanges(player({ news: "Hamstring injury" }), player(), ON);
    expect(event!.changeType).toBe("news_change");
    expect(event!.newValue).toEqual({ news: "" });
  });

  it("hashes stably and stays short", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
    expect(shortHash("a long piece of injury news text").length).toBeLessThanOrEqual(8);
  });
});

describe("ownership moves", () => {
  it("fires on a 1.0pp absolute move regardless of size", () => {
    expect(isOwnershipMove(40, 41)).toBe(true);
    expect(isOwnershipMove(40, 40.9)).toBe(false);
  });

  it("fires on a differential breakout: small in points, huge in relative terms", () => {
    // 0.4 -> 1.1 is +0.7pp and +175%
    expect(isOwnershipMove(0.4, 1.1)).toBe(true);
  });

  it("does not fire on noise near zero", () => {
    // +0.2pp is below the floor even though it is +200%
    expect(isOwnershipMove(0.1, 0.3)).toBe(false);
  });

  it("honours the breakout floor and relative threshold exactly", () => {
    expect(isOwnershipMove(0.6, 0.9)).toBe(true); // +0.3pp, +50%
    expect(isOwnershipMove(0.7, 1.0)).toBe(false); // +0.3pp, +42.9%
    expect(isOwnershipMove(2.0, 2.29)).toBe(false); // +0.29pp, under the floor
  });

  it("treats arriving from zero ownership as a breakout", () => {
    expect(isOwnershipMove(0, 0.4)).toBe(true);
    expect(isOwnershipMove(0, 0.1)).toBe(false); // still under the floor
  });

  it("is symmetric: players being sold matter too", () => {
    expect(isOwnershipMove(41, 40)).toBe(true);
    expect(isOwnershipMove(1.1, 0.4)).toBe(true);
  });
});

describe("set piece changes", () => {
  it("detects taking over penalties", () => {
    const [event] = detectDailyChanges(
      player({ penaltiesOrder: null }),
      player({ penaltiesOrder: 1 }),
      ON,
    );
    expect(event!.changeType).toBe("set_piece_change");
    expect(event!.dedupKey).toBe("set_piece_change:2026-09-23:player:411");
    expect(event!.newValue).toMatchObject({ penalties_order: 1 });
  });

  it("detects losing corner duty", () => {
    const [event] = detectDailyChanges(
      player({ cornersOrder: 1 }),
      player({ cornersOrder: null }),
      ON,
    );
    expect(event!.changeType).toBe("set_piece_change");
  });
});

describe("importance", () => {
  it("weights by ownership, saturating at 50%", () => {
    expect(ownershipWeight(0)).toBe(1);
    expect(ownershipWeight(50)).toBe(5);
    expect(ownershipWeight(73.6)).toBe(5); // Haaland does not get 6x
  });

  it("scales a base score by ownership", () => {
    expect(scoreImportance(BASE_SCORES.price_fall, 0)).toBe(55);
    expect(scoreImportance(BASE_SCORES.price_fall, 50)).toBe(275);
  });

  it("ranks a widely owned injury above a niche price fall", () => {
    const [injury] = detectStateChanges(
      player({ selectedByPercent: 40 }),
      player({ selectedByPercent: 40, status: "i" }),
      ON,
    );
    const [priceFall] = detectDailyChanges(
      player({ selectedByPercent: 0.3 }),
      player({ selectedByPercent: 0.3, nowCost: 149 }),
      ON,
    );
    expect(injury!.importance).toBeGreaterThan(priceFall!.importance);
  });

  it("stays inside smallint", () => {
    const max = scoreImportance(BASE_SCORES.status_change_worse, 100);
    expect(max).toBeLessThanOrEqual(32767);
    expect(max).toBe(300);
  });
});

describe("detectAllChanges", () => {
  it("compares daily fields against yesterday and state fields against the latest", () => {
    const yesterday = player({ nowCost: 150, status: "a", news: "" });
    // price-sync already wrote today's snapshot with the injury
    const latest = player({ nowCost: 150, status: "i", news: "Hamstring" });
    const current = player({ nowCost: 149, status: "i", news: "Hamstring" });

    const events = detectAllChanges(yesterday, latest, current, ON);
    const types = events.map((e) => e.changeType).sort();

    // The status change was already caught intraday; only the price is new.
    expect(types).toEqual(["price_fall"]);
  });

  it("emits both when the state changed since yesterday and nothing ran in between", () => {
    const yesterday = player({ nowCost: 150, status: "a" });
    const current = player({ nowCost: 149, status: "i" });

    const events = detectAllChanges(yesterday, yesterday, current, ON);
    expect(events.map((e) => e.changeType).sort()).toEqual(["price_fall", "status_change"]);
  });
});
