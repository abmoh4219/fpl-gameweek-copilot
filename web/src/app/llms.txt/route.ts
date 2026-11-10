import { SITE } from "@/lib/public-api";

export const revalidate = 86_400;

/** llms.txt (ADR-0024): what Armband is and which pages agents should read, in Markdown. Also served at /.well-known/llms.txt. */
export function GET() {
  const body = `# Armband

> Free, open-source Fantasy Premier League stats hub: player stats, a fixture planner, tonight's price watch, player comparisons, a mini-league spy and shareable cards, with every number computed from FPL's public data. No sign-up.

Forward-looking numbers (fixture runs, price changes, expected points) are estimates. Every page is also available as Markdown: append the path to ${SITE}/md or send \`Accept: text/markdown\`.

## Pages

- [Home](${SITE}/index.md): what Armband does
- [Stats](${SITE}/md/stats): season leaderboards (points, goals, assists, xG, xA, xGI, form, value, ownership)
- [Prices](${SITE}/md/prices): players closest to a price rise or fall tonight (an estimate)
- [Fixtures](${SITE}/md/fixtures): every club's next five gameweeks by FPL difficulty
- [Players](${SITE}/md/players): every player; each has a page at ${SITE}/md/players/{id}
- [Cards](${SITE}/md/cards): shareable images (transfer radar, template XI, price watch, best XI, fixture swings)
- [About](${SITE}/md/about): who builds Armband and how the numbers are made
- [Contact](${SITE}/md/contact): how to reach us

## Data for agents

- [MCP server](${SITE}/api/mcp): Streamable HTTP, tools search_players, get_player, price_watch, fixture_runs (read-only)
- [OpenAPI](${SITE}/openapi.json): the same data as a JSON API under /api/v1

## Source

- [GitHub](https://github.com/abmoh4219/fpl-gameweek-copilot): MIT licensed
`;
  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, s-maxage=86400" } });
}
