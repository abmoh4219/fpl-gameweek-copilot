"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client — used only for sign-in and sign-up forms. */
export function createBrowserAuthClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!;
  return createBrowserClient(url, key, { db: { schema: "api" } });
}
