import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth/server";

/** POST only, so a link or prefetch can never sign someone out. */
export async function POST(request: Request) {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
