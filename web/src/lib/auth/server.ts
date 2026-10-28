import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting AS the signed-in user (their session cookie). Queries go to the
 * `api` schema, the only one the Data API exposes; RLS decides the rest.
 */
export async function createAuthClient() {
  const { url, key } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    db: { schema: "api" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy (src/proxy.ts) refreshes the session on every request.
        }
      },
    },
  });
}

export interface Profile {
  user_id: string;
  fpl_team_id: number | null;
  team_name: string | null;
  manager_name: string | null;
}

export interface Viewer {
  id: string;
  email: string | null;
  name: string | null;
  /** "email" or "google". */
  provider: string | null;
  profile: Profile | null;
}

/**
 * The signed-in user and their profile, or null. `getUser()` verifies the
 * session with Supabase Auth; never trust an unverified cookie for access.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: rows } = await supabase.from("my_profile").select("user_id,fpl_team_id,team_name,manager_name").limit(1);
  const meta = data.user.user_metadata as { full_name?: string; name?: string } | undefined;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: meta?.full_name ?? meta?.name ?? null,
    provider: typeof data.user.app_metadata["provider"] === "string" ? data.user.app_metadata["provider"] : null,
    profile: (rows?.[0] as Profile | undefined) ?? null,
  };
}
