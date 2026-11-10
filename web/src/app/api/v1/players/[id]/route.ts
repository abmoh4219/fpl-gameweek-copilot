import { getPlayer } from "@/lib/public-api";

/** GET /api/v1/players/{id} — public, read-only (ADR-0024). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const data = Number.isInteger(id) && id > 0 ? await getPlayer(id) : null;
  if (!data) return Response.json({ error: "No player with that id" }, { status: 404 });
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600", "access-control-allow-origin": "*" } });
}
