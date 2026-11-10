import { SITE } from "@/lib/public-api";

export const revalidate = 86_400;

/** The OpenAPI description of Armband's public read-only API (ADR-0024). */
export function GET() {
  const player = {
    type: "object",
    properties: {
      id: { type: "integer" }, name: { type: "string" }, team: { type: "string" }, position: { type: "string", enum: ["GKP", "DEF", "MID", "FWD"] },
      price: { type: "number", description: "£m" }, status: { type: "string" }, ownership: { type: "number", description: "% of FPL managers" },
      totalPoints: { type: "integer" }, form: { type: "number" }, minutes: { type: "integer" }, goals: { type: "integer" }, assists: { type: "integer" },
      xg: { type: "number" }, xa: { type: "number" }, xgiPer90: { type: "number" }, url: { type: "string", format: "uri" },
    },
  };
  const json = (schema: object) => ({ description: "OK", content: { "application/json": { schema } } });
  const limit = { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 10 } };
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Armband FPL API",
      version: "1.0.0",
      description: "Free, read-only Fantasy Premier League data computed by Armband from FPL's public data. Forward-looking numbers are estimates. The same data is available as MCP tools at /api/mcp.",
      license: { name: "MIT", url: "https://github.com/abmoh4219/fpl-gameweek-copilot/blob/main/LICENSE" },
    },
    servers: [{ url: SITE }],
    paths: {
      "/api/v1/players": {
        get: {
          operationId: "searchPlayers",
          summary: "Search players by name or club, best season points first",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "position", in: "query", schema: { type: "string", enum: ["GKP", "DEF", "MID", "FWD"] } },
            limit,
          ],
          responses: { "200": json({ type: "object", properties: { updated: { type: ["string", "null"] }, players: { type: "array", items: player } } }) },
        },
      },
      "/api/v1/players/{id}": {
        get: {
          operationId: "getPlayer",
          summary: "One player's season and next five fixtures with FPL difficulty",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": json({
              type: "object",
              properties: {
                updated: { type: ["string", "null"] },
                player,
                nextFixtures: { type: "array", items: { type: "object", properties: { gameweek: { type: "integer" }, opponent: { type: ["string", "null"] }, home: { type: ["boolean", "null"] }, difficulty: { type: ["integer", "null"] } } } },
                news: { type: ["string", "null"] },
                chanceOfPlayingNextRound: { type: ["integer", "null"] },
              },
            }),
            "404": { description: "No player with that id" },
          },
        },
      },
      "/api/v1/prices": {
        get: {
          operationId: "priceWatch",
          summary: "Tonight's price watch from FPL's own data (an estimate)",
          parameters: [{ name: "direction", in: "query", schema: { type: "string", enum: ["rising", "falling"] } }, limit],
          responses: { "200": json({ type: "object" }) },
        },
      },
      "/api/v1/fixtures": {
        get: {
          operationId: "fixtureRuns",
          summary: "Every club's next five gameweeks in FPL difficulty, easiest run first",
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20, default: 20 } }],
          responses: { "200": json({ type: "object" }) },
        },
      },
    },
  };
  return Response.json(spec, { headers: { "cache-control": "public, s-maxage=86400" } });
}
