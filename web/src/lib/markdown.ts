import { ABOUT, CONTACT } from "./site-copy";
import { SITE, fixtureRuns, getPlayer, priceWatch, searchPlayers } from "./public-api";

/**
 * Markdown versions of Armband's public pages, for agents (ADR-0024). Served
 * at /index.md and /md/<path>, and wherever a request sends
 * `Accept: text/markdown` (a rewrite in next.config, so ordinary visitors pay
 * nothing). Built from the same read-only data as the HTML pages.
 */

const FOOTER = `\n---\n\nFree, open-source FPL tools: ${SITE} · Every page as Markdown: ${SITE}/llms.txt · Data: Fantasy Premier League, computed by Armband. Forward-looking numbers are estimates.\n`;

const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const table = (head: string[], rows: (string | number)[][]) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

async function home(): Promise<string> {
  const { players } = await searchPlayers("", null, 5);
  return `# Armband

> Free, open-source Fantasy Premier League stats hub. Every number computed from FPL's public data, no sign-up.

Enter your FPL team ID at ${SITE}/team to see your fifteen on the pitch with five checks (best XI, lineup rating, captain, transfers, injuries).

## Tools

- [Stats](${SITE}/stats): season leaderboards
- [Prices](${SITE}/prices): who is closest to a price change tonight (an estimate)
- [Fixtures](${SITE}/fixtures): every club's next five gameweeks by FPL difficulty
- [Players](${SITE}/players): a page for every player
- [Compare](${SITE}/compare): up to three players on a radar chart
- [Mini-league spy](${SITE}/league): your league's captains, chips and your differentials
- [Cards](${SITE}/cards): shareable images for X

## Top scorers this season

${table(["Player", "Club", "Pos", "Points", "Price", "Owned"], players.map((p) => [`[${p.name}](${SITE}/players/${p.id})`, p.team, p.position, p.totalPoints, `£${p.price.toFixed(1)}m`, `${p.ownership.toFixed(1)}%`]))}
`;
}

async function stats(): Promise<string> {
  const { players, updated } = await searchPlayers("", null, 25);
  return `# Stats

Every player ranked on the numbers that matter for FPL${updated ? `, updated ${updated}` : ""}. The full leaderboards, filters and charts are at ${SITE}/stats.

## Most points

${table(["#", "Player", "Club", "Pos", "Pts", "Form", "G", "A", "xG", "xA", "xGI/90", "Price", "Owned"], players.map((p, i) => [i + 1, `[${p.name}](${SITE}/players/${p.id})`, p.team, p.position, p.totalPoints, p.form.toFixed(1), p.goals, p.assists, p.xg.toFixed(2), p.xa.toFixed(2), p.xgiPer90.toFixed(2), `£${p.price.toFixed(1)}m`, `${p.ownership.toFixed(1)}%`]))}
`;
}

async function prices(): Promise<string> {
  const w = await priceWatch(null, 15);
  const t = (list: typeof w.rising) => table(["Player", "Club", "Pos", "Price", "Progress"], list.map((r) => [`[${r.name}](${r.url})`, r.team, r.position, `£${r.price.toFixed(1)}m`, `${r.progressPercent}%${r.locked ? " (locked)" : ""}`]));
  return `# Prices

Who is closest to a price rise or fall tonight, from FPL's own price-change data. **An estimate:** FPL does not document the rules, and a player can pass 100% without moving.

## Closest to a rise

${t(w.rising)}

## Closest to a fall

${t(w.falling)}
`;
}

async function fixtures(): Promise<string> {
  const f = await fixtureRuns(20);
  const cell = (m: { opponent: string; home: boolean; difficulty: number }[]) => (m.length ? m.map((x) => `${x.home ? x.opponent : x.opponent.toLowerCase()} ${x.difficulty}`).join(" + ") : "blank");
  return `# Fixtures

Every club's next five gameweeks with FPL's difficulty (1 easy, 5 hard), easiest run first. Home in capitals, away in lower case. Run scores are estimates.

${table(["Club", ...f.gameweeks.map((g) => `GW${g}`), "Run"], f.clubs.map((c) => [c.club, ...c.fixtures.map((x) => cell(x.matches)), c.run]))}
`;
}

async function players(): Promise<string> {
  const { players } = await searchPlayers("", null, 50);
  return `# Players

Every FPL player has a page with points per gameweek, FPL's points breakdown, price history and the next five fixtures. Search at ${SITE}/players. The 50 with the most points:

${players.map((p) => `- [${p.name}](${SITE}/players/${p.id}) (${p.team}, ${p.position}, £${p.price.toFixed(1)}m): ${p.totalPoints} pts`).join("\n")}
`;
}

async function playerPage(id: number): Promise<string | null> {
  const d = await getPlayer(id);
  if (!d) return null;
  const p = d.player;
  return `# ${p.name} FPL stats

${p.team} · ${p.position} · £${p.price.toFixed(1)}m · owned by ${p.ownership.toFixed(1)}%${d.news ? `\n\n**News:** ${d.news}` : ""}

${table(["Points", "Form", "Minutes", "Goals", "Assists", "xG", "xA", "xGI/90"], [[p.totalPoints, p.form.toFixed(1), p.minutes, p.goals, p.assists, p.xg.toFixed(2), p.xa.toFixed(2), p.xgiPer90.toFixed(2)]])}

## Next five gameweeks (FPL difficulty, 1 easy, 5 hard)

${d.nextFixtures.map((f) => `- GW${f.gameweek}: ${f.opponent === null ? "blank" : `${f.opponent} (${f.home ? "home" : "away"}), difficulty ${f.difficulty}`}`).join("\n")}

Charts and the full season: ${p.url}
`;
}

function cards(): string {
  const list = [
    ["transfers", "The transfer radar", "this gameweek's biggest net transfers in and out"],
    ["template", "The template XI", "the most-owned XI on a pitch"],
    ["prices", "Tonight's price watch", "closest to a rise or fall (an estimate)"],
    ["best-xi", "The gameweek's best XI", "the highest-scoring XI of the latest gameweek"],
    ["swings", "Fixture swings", "whose run turns easier or harder"],
  ];
  return `# Cards

Shareable images made from FPL's data, each with its own page so a shared link shows the card.

${list.map(([slug, title, sub]) => `- [${title}](${SITE}/cards/${slug}): ${sub}. Image: ${SITE}/cards/${slug}/image.png`).join("\n")}
`;
}

function about(): string {
  return `# ${ABOUT.title}

${ABOUT.intro}

${ABOUT.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n")}

${ABOUT.links.map((l) => `- [${l.label}](${l.href})`).join("\n")}
`;
}

function contact(): string {
  return `# ${CONTACT.title}

${CONTACT.intro}

${CONTACT.ways.map((w) => `## ${w.heading}\n\n${w.body}\n\n[${w.label}](${w.href})`).join("\n\n")}

${CONTACT.note}
`;
}

function legal(kind: "privacy" | "terms"): string {
  return kind === "privacy"
    ? `# Privacy\n\nArmband stores nothing about you: no accounts, no cookies, no tracking you. Your team ID and applied plans stay in your own browser. Page views are counted anonymously by Vercel Web Analytics, without cookies, and team, league and wrapped pages are counted together. Full text: ${SITE}/privacy\n`
    : `# Terms\n\nArmband is free, independent and provided as it is. Everything about the future is an estimate, not advice. It is not affiliated with the Premier League or Fantasy Premier League. Full text: ${SITE}/terms\n`;
}

/** Markdown for a public path, or null when there is no such page. */
export async function pageMarkdown(path: string[]): Promise<string | null> {
  const [a, b, ...rest] = path.filter(Boolean);
  if (rest.length) return null;
  let body: string | null = null;
  if (!a || a === "index") body = await home();
  else if (!b && a === "stats") body = await stats();
  else if (!b && a === "prices") body = await prices();
  else if (!b && a === "fixtures") body = await fixtures();
  else if (!b && a === "players") body = await players();
  else if (a === "players" && b && /^\d{1,6}$/.test(b)) body = await playerPage(Number(b));
  else if (!b && a === "cards") body = cards();
  else if (!b && a === "about") body = about();
  else if (!b && a === "contact") body = contact();
  else if (!b && (a === "privacy" || a === "terms")) body = legal(a);
  return body === null ? null : body + FOOTER;
}

/** What an agent gets for a page that doesn't exist: a 404 with where to look next. */
export const NOT_FOUND_MARKDOWN = `# Page not found

There is no page at this address.

Where to look next:

- [Home](${SITE}/index.md)
- [Stats](${SITE}/md/stats), [Prices](${SITE}/md/prices), [Fixtures](${SITE}/md/fixtures), [Players](${SITE}/md/players)
- [llms.txt](${SITE}/llms.txt): every page agents should read
- [MCP server](${SITE}/api/mcp) and [OpenAPI](${SITE}/openapi.json) for data
${FOOTER}`;

/**
 * The Markdown answer. A copy of a page must never compete with the page in
 * search results, so it says noindex and names the HTML page as canonical.
 */
export function markdownResponse(body: string | null, htmlPath = "/"): Response {
  const headers: Record<string, string> = {
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
    vary: "Accept",
    "x-robots-tag": "noindex",
  };
  if (body !== null) headers["link"] = `<${SITE}${htmlPath}>; rel="canonical"`;
  return new Response(body ?? NOT_FOUND_MARKDOWN, { status: body === null ? 404 : 200, headers });
}
