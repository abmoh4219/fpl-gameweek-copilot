import { clampLimit, priceWatch } from "@/lib/public-api";

/** GET /api/v1/prices?direction=&limit= — tonight's price watch, an estimate (ADR-0024). */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const data = await priceWatch(p.get("direction"), clampLimit(p.get("limit")));
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600", "access-control-allow-origin": "*" } });
}
