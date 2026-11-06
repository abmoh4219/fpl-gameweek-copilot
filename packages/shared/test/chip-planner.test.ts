import { describe, expect, it } from "vitest";
import { buildSquad, chipWeeks, chipsUsed } from "../src/index.ts";
import { cardRows, entry, picks } from "./fixtures.ts";

describe("the chip planner", () => {
  it("counts who plays, twice or not at all, in each coming gameweek", () => {
    const squad = buildSquad({ entry, picks, cards: cardRows, eventPoints: new Map() });
    // Give Haaland a double in GW9 and Raya a blank.
    const haaland = squad.starters.find((p) => p.webName === "Haaland")!;
    haaland.fixtures = [
      { gameweek: 9, opponent: "AVL", isHome: false, difficulty: 3, isBlank: false, isDouble: true },
      { gameweek: 9, opponent: "LIV", isHome: true, difficulty: 4, isBlank: false, isDouble: true },
    ];
    const raya = squad.starters.find((p) => p.webName === "Raya")!;
    raya.fixtures = [{ gameweek: 9, opponent: null, isHome: null, difficulty: null, isBlank: true, isDouble: false }];
    const [gw9] = chipWeeks(squad);
    expect(gw9).toMatchObject({ gameweek: 9, playing: 14, doubles: 1, blanks: 1, xiPlaying: 10 });
    expect(gw9!.xiDifficulty).toBe(3.1);
  });

  it("names the chips already played, in order", () => {
    expect(chipsUsed([{ name: "bboost", event: 7 }, { name: "wildcard", event: 4 }])).toEqual([
      { name: "Wildcard", gameweek: 4 },
      { name: "Bench Boost", gameweek: 7 },
    ]);
  });
});
