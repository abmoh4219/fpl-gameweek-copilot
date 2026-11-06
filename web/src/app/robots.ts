import type { MetadataRoute } from "next";

const SITE = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

/** Crawl the public tools; keep personal pages (a team, a league, a wrapped card) and the API out (ADR-0023). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/team/", "/league/", "/wrapped/"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
