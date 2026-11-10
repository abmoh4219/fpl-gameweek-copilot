import { closestToChange, normalizeName, type StatPosition, type StatRow, type WatchRow } from "@fpl/shared";
import { allCards } from "./cards";
import { fixtureGridData, statRows, watchRows } from "./cards/data";

/**
 * Armband's public, read-only data (ADR-0024): the functions behind the MCP
 * tools (/api/mcp), the JSON API (/api/v1, described at /openapi.json) and the
 * Markdown pages. Every one reads the shared cached views only, so heavy use
 * by agents costs no FPL calls and barely moves Supabase egress. Nothing
 * personal: no team, league or wrapped data is exposed here.
 */

export const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

export interface PublicPlayer {
  id: number;
  name: string;
  team: string;
  position: StatPosition;
  price: number;
  status: string;
  ownership: number;
  totalPoints: number;
  form: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  xgiPer90: number;
  url: string;
}

function player(r: StatRow): PublicPlayer {
  return {
    id: r.fplId,
    name: r.webName,
    team: r.team,
    position: r.position,
    price: r.priceM,
    status: r.status,
    ownership: r.ownership,
    totalPoints: r.totalPoints,
    form: r.form,
    minutes: r.minutes,
    goals: r.goals,
    assists: r.assists,
    xg: Math.round(r.xg * 100) / 100,
    xa: Math.round(r.xa * 100) / 100,
    xgiPer90: Math.round(r.xgi90 * 100) / 100,
    url: `${SITE}/players/${r.fplId}`,
  };
}

const POSITIONS = new Set(["GKP", "DEF", "MID", "FWD"]);

export function clampLimit(raw: unknown, fallback = 10, max = 50): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

/** Players by name or club (accents and case ignored), best season points first. */
export async function searchPlayers(query: string, position: string | null, limit: number): Promise<{ updated: string | null; players: PublicPlayer[] }> {
  const { rows, date } = await statRows();
  const q = normalizeName(query.trim().slice(0, 40));
  const pos = position && POSITIONS.has(position.toUpperCase()) ? position.toUpperCase() : null;
  const players = rows
    .filter((r) => (!pos || r.position === pos) && (!q || normalizeName(`${r.webName} ${r.team}`).includes(q)))
    .sort((a, b) => b.totalPoints - a.totalPoints || a.webName.localeCompare(b.webName))
    .slice(0, limit)
    .map(player);
  return { updated: date, players };
}

/** One player's season so far, with the next five fixtures in FPL's difficulty (1 easy, 5 hard). */
export async function getPlayer(id: number) {
  const [{ rows, date }, cards] = await Promise.all([statRows(), allCards()]);
  const row = rows.find((r) => r.fplId === id);
  if (!row) return null;
  const card = cards.get(id)?.card;
  return {
    updated: date,
    player: player(row),
    nextFixtures: (card?.fixturesLong.fixtures ?? []).map((f) => ({
      gameweek: f.gameweek,
      opponent: f.isBlank ? null : f.opponent,
      home: f.isBlank ? null : f.isHome,
      difficulty: f.isBlank ? null : f.difficulty,
    })),
    news: card?.news || null,
    chanceOfPlayingNextRound: card?.chanceOfPlayingNextRound ?? null,
  };
}

function watch(r: WatchRow) {
  return {
    id: r.fplId,
    name: r.webName,
    team: r.team,
    position: r.position,
    price: r.priceM,
    progressPercent: Math.round(Math.abs(r.percent) * 10) / 10,
    direction: r.direction,
    locked: r.locked,
    url: `${SITE}/players/${r.fplId}`,
  };
}

/** Tonight's price watch from FPL's own price-change data. An estimate: past 100% is not a confirmed change. */
export async function priceWatch(direction: string | null, limit: number) {
  const rows = await watchRows();
  const pick = (d: "rising" | "falling") => closestToChange(rows, d, null, limit).map(watch);
  return {
    estimate: true,
    note: "Progress toward a price change, from FPL's own data. FPL does not document the rules; a player can pass 100% and not move.",
    rising: direction === "falling" ? [] : pick("rising"),
    falling: direction === "rising" ? [] : pick("falling"),
  };
}

/** Every club's next five gameweeks in FPL difficulty, easiest run first. */
export async function fixtureRuns(limit: number) {
  const { gameweeks, rows } = await fixtureGridData();
  return {
    estimate: true,
    gameweeks,
    clubs: [...rows]
      .sort((a, b) => a.next5 - b.next5)
      .slice(0, limit)
      .map((r) => ({
        club: r.team,
        adjustedDifficultyNext3: Math.round(r.next3 * 100) / 100,
        adjustedDifficultyNext5: Math.round(r.next5 * 100) / 100,
        run: r.band5,
        fixtures: r.cells.map((c, i) => ({
          gameweek: gameweeks[i] ?? null,
          matches: c.fixtures.map((f) => ({ opponent: f.opponent, home: f.isHome, difficulty: f.difficulty })),
        })),
      })),
  };
}
