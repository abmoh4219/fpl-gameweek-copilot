import { chipName } from "./wrapped.ts";
import type { Squad } from "./squad.ts";

/**
 * The chip planner (ADR-0021): the facts behind chip timing, never a call.
 * For each of the next five gameweeks, how many of the fifteen (and of the
 * XI) have a fixture, how many have two, and the XI's average FPL difficulty.
 */
export interface ChipWeek {
  gameweek: number;
  /** Of the fifteen with at least one fixture. */
  playing: number;
  /** Of the fifteen with two fixtures. */
  doubles: number;
  /** Of the fifteen with none. */
  blanks: number;
  /** Of the current XI with at least one fixture. */
  xiPlaying: number;
  /** Mean FPL difficulty of the XI's fixtures; null when none of them plays. */
  xiDifficulty: number | null;
}

export function chipWeeks(squad: Squad): ChipWeek[] {
  const all = [...squad.starters, ...squad.bench];
  const weeks = [...new Set(all.flatMap((p) => p.fixtures.map((f) => f.gameweek)))].sort((a, b) => a - b);
  return weeks.map((gw) => {
    const of = (p: (typeof all)[number]) => p.fixtures.filter((f) => f.gameweek === gw && !f.isBlank);
    const counts = all.map((p) => {
      const fx = of(p);
      return fx.length > 1 || fx.some((f) => f.isDouble) ? 2 : fx.length;
    });
    const xiFixtures = squad.starters.flatMap(of).filter((f) => f.difficulty !== null);
    return {
      gameweek: gw,
      playing: counts.filter((c) => c > 0).length,
      doubles: counts.filter((c) => c > 1).length,
      blanks: counts.filter((c) => c === 0).length,
      xiPlaying: squad.starters.filter((p) => of(p).length > 0).length,
      xiDifficulty: xiFixtures.length ? Math.round((xiFixtures.reduce((s, f) => s + f.difficulty!, 0) / xiFixtures.length) * 10) / 10 : null,
    };
  });
}

/** The chips already played this season, in FPL's order, with their gameweeks. */
export function chipsUsed(chips: readonly { name: string; event: number }[]): { name: string; gameweek: number }[] {
  return [...chips].sort((a, b) => a.event - b.event).map((c) => ({ name: chipName(c.name) ?? c.name, gameweek: c.event }));
}
