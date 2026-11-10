import { clampLimit, fixtureRuns } from "@/lib/public-api";

/** GET /api/v1/fixtures?limit= — every club's next five gameweeks, easiest first (ADR-0024). */
export async function GET(request: Request) {
  const data = await fixtureRuns(clampLimit(new URL(request.url).searchParams.get("limit"), 20, 20));
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600", "access-control-allow-origin": "*" } });
}
