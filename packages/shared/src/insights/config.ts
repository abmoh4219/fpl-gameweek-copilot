/**
 * EVERY weight, threshold and band boundary lives here.
 *
 * Tuning the engine is then a deliberate edit to one file with tests around
 * it, rather than a stray constant buried in a scoring function. Nothing in
 * insights/ may hardcode a number that belongs in this object.
 */
export const INSIGHT_CONFIG = {
  form: {
    /** Points over 4 gameweeks that counts as a perfect 100 form score. */
    pointsForFullScore: 40,
    /** Minutes over 4 gameweeks that counts as fully nailed on. */
    minutesForFullScore: 360,
  },

  minutesRisk: {
    /** Added to the risk score by availability status. */
    statusPenalty: { a: 0, d: 25, i: 60, s: 60, u: 70, n: 70 } as Record<string, number>,
    /** Added by chance_of_playing_next_round. Null means "no news" = no penalty. */
    chancePenalty: [
      { atMost: 0, penalty: 80 },
      { atMost: 25, penalty: 55 },
      { atMost: 50, penalty: 35 },
      { atMost: 75, penalty: 15 },
    ],
    minutesPenalty: [
      { below: 180, penalty: 25 },
      { below: 270, penalty: 15 },
    ],
    startsPenalty: [
      { atMost: 1, penalty: 25 },
      { atMost: 2, penalty: 10 },
    ],
    /** Rotation risk around a midweek Champions League match. */
    congestionPenalty: { afterCl: 8, beforeCl: 8 },
    bands: { lowBelow: 25, mediumBelow: 55 },
  },

  fixtureRun: {
    shortHorizon: 3,
    longHorizon: 5,
    /** FPL difficulty is 1-5; team strength nudges it by at most this much. */
    strengthWeight: 0.6,
    /**
     * `strength_overall_*` is a 1-5 scale (confirmed from the API: observed
     * range 2-4, mean 3). It is NOT the ~1000-1400 scale some FPL docs
     * describe — assuming that crushed every fixture to the floor.
     */
    strengthBaseline: 3,
    strengthScale: 2,
    /** Playing at home is worth this much off the effective difficulty. */
    homeAdvantage: 0.25,
    /** A blank gameweek is worse than any hard fixture. */
    blankPenalty: 1.5,
    /** A double gameweek is worth roughly one easy extra fixture. */
    doubleBonus: 0.8,
    bands: { easyAtMost: 2.6, mediumAtMost: 3.4 },
  },

  goalThreat: {
    /** Recent form is weighted above the season, but the season anchors it. */
    seasonWeight: 0.4,
    recentWeight: 0.6,
    /**
     * Opponent defensive strength moves threat by at most +/- this fraction.
     *
     * `strength_defence_*` is ZERO for all 20 teams in the current API, so
     * `defensiveRating` falls back to the opponent's overall strength as a
     * proxy. Same 1-5 scale (docs/data-dictionary.md).
     */
    defenceWeight: 0.35,
    defenceBaseline: 3,
    defenceScale: 2,
    /**
     * Minutes over the last 4 gameweeks needed to fully trust a per-90 rate.
     * Below this, recent xGI/90 is blended back toward the season figure in
     * proportion to the sample — one 20-minute cameo must not read as elite.
     */
    minMinutesForRecent: 180,
    /**
     * Season minutes needed before a per-90 rate is trusted AT ALL.
     *
     * A player with 3 minutes all season showed a season xGI/90 of 12.9 — the
     * rate is arithmetically true and completely meaningless. Threat is
     * scaled down in proportion to the sample, which also encodes the obvious
     * football point: someone who does not play has no goal threat.
     */
    minSeasonMinutesForRate: 270,
    penaltyBonus: { first: 1.15, second: 1.05 },
    homeBonus: 1.05,
    bands: { highAtLeast: 0.75, mediumAtLeast: 0.4 },
  },

  captain: {
    /**
     * ep_next is FPL's own expected points and already folds in minutes,
     * form and fixture, so it is the backbone. Goal threat MODIFIES it rather
     * than competing with it — an earlier weight of 8.0 let a fringe player's
     * noisy xGI/90 outrank an 11-point expectation.
     */
    weights: { epNext: 1.0, goalThreat: 4.0, fixtureEase: 1.2, home: 0.6 },
    /** A captain must be reasonably certain to play. */
    maxMinutesRisk: 55,
    /** And must actually be a starter — captaincy is a certainty bet. */
    minMinutesLast4: 180,
    topN: 5,
  },

  differentials: {
    maxOwnership: 10,
    minMinutesLast4: 180,
    weights: { form: 1.0, goalThreat: 6.0, fixtureEase: 1.0, scarcity: 0.8 },
    topN: 5,
  },

  priceWatch: {
    /** Only surface players meaningfully far along toward a change. */
    minAbsPercent: 50,
    topN: 5,
  },

  report: {
    /** Telegram hard-caps messages at 4096; leave room for the split marker. */
    maxMessageChars: 4000,
    /** X drafts are posted by hand, so keep them comfortably postable. */
    maxXPostChars: 240,
    topPriceChanges: 8,
    topStatusChanges: 6,
  },
} as const;

export type InsightConfig = typeof INSIGHT_CONFIG;
