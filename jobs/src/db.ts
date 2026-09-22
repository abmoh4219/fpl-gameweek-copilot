import postgres from "postgres";
import { z } from "zod";

/**
 * Database access for jobs.
 *
 * Jobs connect DIRECTLY to Postgres, not through PostgREST. The Data API
 * exposes only the `api` schema, so even the service role cannot reach `core`
 * over HTTP — that is the security model working as designed (ADR-0005).
 */

const DbEnvSchema = z.object({
  SUPABASE_DB_URL: z
    .string()
    .min(1, "SUPABASE_DB_URL is required for database work")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "SUPABASE_DB_URL must be a postgres connection string",
    }),
});

export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** True for a local `supabase start` stack, false for anything hosted. */
export function isLocalDatabase(url: string): boolean {
  return /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url);
}

export function resolveDbUrl(): string {
  const parsed = DbEnvSchema.safeParse({ SUPABASE_DB_URL: process.env["SUPABASE_DB_URL"] });
  if (!parsed.success) {
    throw new Error(
      `Invalid database config:\n` +
        parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }
  return parsed.data.SUPABASE_DB_URL;
}

export type Db = postgres.Sql;

export function connect(url: string = resolveDbUrl()): Db {
  return postgres(url, {
    // Loaders batch aggressively; a small pool is plenty for a cron job.
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
    // Never log the connection string or parameter values.
    onnotice: () => {},
  });
}
