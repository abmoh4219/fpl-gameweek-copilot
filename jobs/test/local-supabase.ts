import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Integration tests need a local `supabase start` stack. When it is not
 * running they SKIP with a clear message rather than failing — and they never
 * fall back to a hosted database.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

export interface LocalStack {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
}

let cached: LocalStack | null | undefined;

export const SKIP_MESSAGE =
  "local Supabase is not running — start it with `pnpm db:start` (needs Docker)";

/** Returns the local stack's URLs and keys, or null when it is not running. */
export function localStack(): LocalStack | null {
  if (cached !== undefined) return cached;
  try {
    const raw = execFileSync(
      path.join(REPO_ROOT, "node_modules", ".bin", "supabase"),
      ["status", "-o", "json"],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 },
    );
    const status = JSON.parse(raw) as Record<string, string>;
    const apiUrl = status["API_URL"];
    const anonKey = status["ANON_KEY"];
    const serviceRoleKey = status["SERVICE_ROLE_KEY"];
    const dbUrl = status["DB_URL"];
    if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl) {
      cached = null;
    } else {
      cached = { apiUrl, anonKey, serviceRoleKey, dbUrl };
    }
  } catch {
    cached = null;
  }
  if (cached === null) console.warn(`\n  SKIPPING database tests: ${SKIP_MESSAGE}\n`);
  return cached;
}

export const SAMPLES_DIR = path.join(REPO_ROOT, "samples");
