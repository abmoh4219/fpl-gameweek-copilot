import { clampLimit, searchPlayers } from "@/lib/public-api";

/** GET /api/v1/players?q=&position=&limit= — public, read-only (ADR-0024). */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const data = await searchPlayers(p.get("q") ?? "", p.get("position"), clampLimit(p.get("limit")));
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600", "access-control-allow-origin": "*" } });
}
