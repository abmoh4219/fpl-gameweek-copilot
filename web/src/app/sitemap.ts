import type { MetadataRoute } from "next";
import { readView } from "@/lib/supabase";

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

export const revalidate = 86_400;

/**
 * Every public page, and a page for every player in the game (ADR-0023): people
 * search for "<player> FPL stats", and each player page answers exactly that.
 * Personal pages (teams, leagues, wrapped) are never listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
    ["/", 1, "daily"],
    ["/stats", 0.9, "daily"],
    ["/prices", 0.9, "daily"],
    ["/fixtures", 0.9, "daily"],
    ["/players", 0.8, "daily"],
    ["/cards", 0.7, "daily"],
    ["/compare", 0.6, "weekly"],
    ["/league", 0.6, "weekly"],
    ["/team", 0.6, "monthly"],
    ["/cards/transfers", 0.6, "daily"],
    ["/cards/template", 0.6, "daily"],
    ["/cards/prices", 0.6, "daily"],
    ["/cards/best-xi", 0.6, "weekly"],
    ["/cards/swings", 0.6, "weekly"],
    ["/privacy", 0.2, "yearly"],
    ["/terms", 0.2, "yearly"],
  ];
  const players = await readView<{ fpl_id: number; minutes: number }>("player_current", "select=fpl_id,minutes", 86_400).catch(() => []);
  return [
    ...pages.map(([path, priority, changeFrequency]) => ({ url: `${SITE}${path}`, lastModified: now, changeFrequency, priority })),
    // Players who have played rank first; everyone gets a page.
    ...players.map((p) => ({ url: `${SITE}/players/${p.fpl_id}`, lastModified: now, changeFrequency: "daily" as const, priority: p.minutes > 0 ? 0.7 : 0.4 })),
  ];
}
