import { describe, expect, it } from "vitest";
import {
  applyPlan,
  buildSquad,
  captainOptions,
  captainPlan,
  injuryCheck,
  lineupCheck,
  squadPlayerFromCard,
  transferOptions,
  transferPlan,
  type SiteCard,
} from "../src/index.ts";
import { all, byId, card, cardRows, entry, picks, squadCards } from "./fixtures.ts";

const squad = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map() });
const owned = new Map(squadCards.map((c) => [c.fplId, c]));

describe("the Gaffer's lineup check", () => {
  it("rates the XI and finds the best one, benching the injured starter", () => {
    const check = lineupCheck(squad, owned)!;
    // Cherki (injured, 0 expected points) starts in the fixture squad.
    expect(check.issues[0]).toBe("Cherki is starting but is not expected to play.");
    expect(check.rating).toBeLessThan(10);
    expect(check.pointsBest).toBeGreaterThan(check.pointsNow);
    expect(check.best.starters).not.toContain(8);
    expect(applyPlan(squad, check.best, new Map())).not.toBeNull();
  });

  it("returns nothing rather than guessing when a card is missing", () => {
    expect(lineupCheck(squad, new Map([...owned].slice(1)))).toBeNull();
  });
});

describe("the Gaffer's captain check", () => {
  it("ranks trusted starters by captain score and puts the injured last, with the reason", () => {
    const cards = new Map(owned);
    cards.set(7, card({ fplId: 7, webName: "Rogers", team: "CHE", position: "MID", priceM: 8, epNext: 9 }));
    const options = captainOptions(squad, cards);
    expect(options[0]!.webName).toBe("Rogers");
    expect(options.some((o) => o.webName === "Raya")).toBe(false);
    const cherki = options.at(-1)!;
    expect(cherki).toMatchObject({ webName: "Cherki", eligible: false, reason: "Not expected to play" });
    expect(options.find((o) => o.webName === "Haaland")!.isCaptain).toBe(true);
  });

  it("makes a captain plan with the best other trusted option as vice", () => {
    const options = captainOptions(squad, owned);
    const plan = captainPlan(squad, options, 7);
    expect(plan.captain).toBe(7);
    expect(plan.vice).not.toBe(7);
    expect(options.find((o) => o.fplId === plan.vice)!.eligible).toBe(true);
  });
});

describe("the Gaffer's transfer options", () => {
  const slots = transferOptions(squad, all);

  it("offers legal like-for-like options within budget, never someone already owned", () => {
    const rogers = slots.find((s) => s.out.webName === "Rogers")!;
    expect(rogers.budgetM).toBe(8.7); // 8.0 + 0.7 in the bank
    const names = rogers.ideas.expected_points.map((i) => i.webName);
    // Salah is over budget, the bench warmer has no minutes, Doubtful Dan is flagged.
    expect(names).not.toContain("Salah");
    expect(names).not.toContain("Bench Warmer");
    expect(names).not.toContain("Doubtful Dan");
    expect(rogers.ideas.form[0]!.webName).toBe("Mbeumo");
    expect(rogers.ideas.form[0]!.bankAfterM).toBe(0.8);
  });

  it("respects the 3-per-club limit", () => {
    // Three MCI already (Cherki, Haaland, O'Reilly): Foden only fits when an MCI player goes.
    const tavernier = slots.find((s) => s.out.webName === "Tavernier")!;
    expect(Object.values(tavernier.ideas).flat().some((i) => i.webName === "Foden")).toBe(false);
    const cherki = slots.find((s) => s.out.webName === "Cherki")!;
    expect(cherki.ideas.expected_points.some((i) => i.webName === "Foden")).toBe(true);
  });

  it("turns a chosen option into a plan the pitch can draw", () => {
    const plan = transferPlan(squad, 7, 100);
    const incoming = squadPlayerFromCard(byId.get(100) as SiteCard, 1);
    expect(plan.transfers).toEqual([{ out: 7, in: 100 }]);
    expect(plan.starters).toContain(100);
    const after = applyPlan(squad, plan, new Map([[100, incoming]]))!;
    expect(after.starters.some((p) => p.webName === "Mbeumo")).toBe(true);
    expect(after.bankM).toBeCloseTo(0.8);
  });
});

describe("the Gaffer's injury check", () => {
  it("lists flagged players with FPL's news and who on the bench covers a starter", () => {
    const flags = injuryCheck(squad, owned);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ webName: "Cherki", status: "Injured", chance: 0, isStarter: true });
    // Bench order is Kinsky (GKP), O'Reilly, João Pedro, Truffert: the keeper cannot cover a midfielder.
    expect(flags[0]!.cover?.webName).toBe("O'Reilly");
  });

  it("is empty when nobody is flagged", () => {
    const fit = new Map(owned);
    fit.set(8, card({ fplId: 8, webName: "Cherki", team: "MCI", position: "MID", priceM: 8 }));
    const fitSquad = buildSquad({ entry, picks, cards: new Map([...cardRows].map(([id, r]) => [id, id === 8 ? { ...r, card: fit.get(8)! } : r])), eventPoints: new Map() });
    expect(injuryCheck(fitSquad, fit)).toEqual([]);
  });
});
