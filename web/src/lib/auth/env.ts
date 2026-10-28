/** Public by design: the URL and publishable key are what browsers use (ADR-0008). */
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY)");
  return { url, key };
}

/** Only allow same-site relative redirects, so ?next= cannot send users elsewhere. */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
