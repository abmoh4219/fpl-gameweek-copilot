import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/env";
import { createAuthClient } from "@/lib/auth/server";

/** Google (and any OAuth) sign-in lands here with a one-time code. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/sign-in?error=oauth`);
}
