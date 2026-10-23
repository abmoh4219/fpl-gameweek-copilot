import { ukDeadlineLabel } from "../dates.ts";
import { INSIGHT_CONFIG } from "../insights/config.ts";
import { renderReport } from "./render.ts";
import type { BuiltReport, ReportPayload, ReportSection } from "./types.ts";

/**
 * Gemini's part of the preview (ADR-0007), as three pure steps:
 *
 *   previewFacts()   what the model is ALLOWED to say, already computed
 *   previewPrompt()  the instructions, versioned here rather than in Make
 *   validateProse()  what code checks before a word of it is published
 *
 * The hard rule (CLAUDE.md §2): the model never calculates, never ranks and
 * never introduces a number that was not passed in. The prompt asks for
 * that; validateProse() enforces it. Rejected prose means the template ships.
 */

type SectionOf<K extends ReportSection["kind"]> = Extract<ReportSection, { kind: K }>;

function section<K extends ReportSection["kind"]>(payload: ReportPayload, kind: K): SectionOf<K> | undefined {
  return payload.sections.find((s): s is SectionOf<K> => s.kind === kind);
}

const oneDp = (n: number) => Number(n.toFixed(1));
const twoDp = (n: number) => Number(n.toFixed(2));

/**
 * Facts in the same precision the rendered report shows, so prose and
 * sections can never disagree about a number. Order is the ranking.
 */
export function previewFacts(payload: ReportPayload, deadlineUtc: string | null) {
  const captains = section(payload, "captains")?.items ?? [];
  const differentials = section(payload, "differentials")?.items ?? [];
  const swings = section(payload, "fixture_swings")?.items ?? [];
  const congestion = section(payload, "congestion")?.items ?? [];

  const run = (s: (typeof swings)[number]) => ({
    team: s.team,
    band: s.band,
    difficulty: twoDp(s.adjustedDifficulty),
    fixtures: s.fixtures
      .map((f) => `${f.opponent ?? "blank"}${f.isHome ? " (home)" : f.isHome === false ? " (away)" : ""}`)
      .join(", "),
  });

  return {
    gameweek: payload.gameweek,
    deadline: deadlineUtc ? ukDeadlineLabel(deadlineUtc) : null,
    captainOptions: captains.map((c) => {
      const next = c.card.fixtures.fixtures[0];
      return {
        name: c.webName,
        team: c.team,
        position: c.position,
        priceMillions: oneDp(c.priceM),
        expectedPoints: oneDp(c.card.epNext),
        goalThreat: c.card.goalThreat.band.toLowerCase(),
        opponent: next?.opponent ?? null,
        venue: next?.isHome ? "home" : next?.isHome === false ? "away" : null,
        onPenalties: c.card.goalThreat.onPenalties,
      };
    }),
    differentials: differentials.map((d) => ({
      name: d.webName,
      team: d.team,
      ownershipPercent: oneDp(d.ownership),
      pointsLast4Gameweeks: d.card.form.points,
      fixtureRun: d.card.fixtures.band.toLowerCase(),
    })),
    // fixture_swings is the three easiest, then the three hardest
    easiestFixtureRuns: swings.slice(0, 3).map(run),
    hardestFixtureRuns: swings.slice(3).map(run),
    championsLeagueCongestion: congestion.map((c) => ({
      team: c.team,
      daysBeforeChampionsLeague: c.isBeforeCl && c.daysUntilCl !== null ? oneDp(c.daysUntilCl) : null,
      daysAfterChampionsLeague: c.isAfterCl && c.daysSinceCl !== null ? oneDp(c.daysSinceCl) : null,
    })),
  };
}

export type PreviewFacts = ReturnType<typeof previewFacts>;

export function previewPrompt(facts: PreviewFacts): string {
  const { maxChars } = INSIGHT_CONFIG.ai;
  return [
    `Write the opening paragraph of a Fantasy Premier League preview for gameweek ${facts.gameweek}.`,
    "Sound like a sharp FPL analyst talking to managers: natural, specific, no filler.",
    "",
    "Rules:",
    `- 3 to 4 sentences, under ${maxChars - 300} characters, in British English.`,
    "- Plain text only: no markdown, no bullet points, no emoji, no hashtags, no links.",
    "- Use ONLY the facts below. Do not add any player, team, statistic or prediction that is not in them.",
    "- Every number you write must appear in the facts exactly as given. Do not calculate, total, average or compare numbers.",
    "- The lists are already ranked. Do not re-rank them; the first captain option is the top one.",
    "- Cover the top captain option, one differential and the most notable fixture run. Mention Champions League congestion only if it is listed, in a few words.",
    "- Never write the JSON field names. Say \"6.5% owned\", not \"ownershipPercent\" or \"6.5 ownership percent\".",
    "- Do not copy the fixture lists; name at most the first opponent of a run.",
    "- Do not mention the deadline; the report's headline already shows it.",
    "- These are estimates. Never call a pick certain, guaranteed or a lock.",
    "",
    "Facts (JSON):",
    JSON.stringify(facts),
  ].join("\n");
}

/** Every key the facts use, so a leaked field name can be caught. */
function factKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) factKeys(item, keys);
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      factKeys(inner, keys);
    }
  }
  return keys;
}

export type ProseCheck = { ok: true; prose: string } | { ok: false; reason: string };

/** Every numeric token in the facts, normalised so 2.40 and 2.4 match. */
export function allowedNumbers(facts: PreviewFacts): Set<number> {
  const allowed = new Set<number>();
  for (const token of JSON.stringify(facts).match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(Number(token));
  return allowed;
}

/**
 * Code's veto over model output. Cleans what is safe to clean (stray markdown,
 * wrapping quotes, whitespace) and rejects what is not: wrong length, links,
 * and above all any number the facts do not contain.
 */
export function validateProse(raw: string, facts: PreviewFacts): ProseCheck {
  const { minChars, maxChars } = INSIGHT_CONFIG.ai;

  const prose = raw
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“](.*)["”]$/, "$1")
    .trim();

  if (prose.length < minChars) return { ok: false, reason: `too short (${prose.length} chars)` };
  if (prose.length > maxChars) return { ok: false, reason: `too long (${prose.length} chars)` };
  if (/https?:\/\/|www\./i.test(prose)) return { ok: false, reason: "contains a link" };

  // "3 daysBeforeChampionsLeague" was observed: the model echoing the JSON.
  const leaked = [...factKeys(facts)].filter((key) => /[A-Z]/.test(key) && prose.includes(key));
  if (leaked.length > 0) return { ok: false, reason: `leaks field names: ${leaked.join(", ")}` };

  const allowed = allowedNumbers(facts);
  // "125,000" is one number: commas are thousands separators, never decimals.
  const invented = (prose.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((token) => Number(token.replace(/,/g, "")))
    .filter((n) => !allowed.has(n));
  if (invented.length > 0) {
    return { ok: false, reason: `numbers not in the facts: ${[...new Set(invented)].join(", ")}` };
  }

  return { ok: true, prose };
}

/** The same report with validated prose on top, re-rendered. */
export function withProse(report: BuiltReport, prose: string): BuiltReport {
  const payload: ReportPayload = { ...report.payload, prose };
  return { payload, messages: renderReport(payload) };
}
