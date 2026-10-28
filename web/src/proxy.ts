import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request (Next 16's renamed middleware): refreshes the
 * Supabase session cookie so Server Components always see a valid session,
 * and keeps signed-out visitors out of /app and /onboarding.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not put code between createServerClient and getUser: it refreshes the session.
  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAccount = path === "/app" || path.startsWith("/app/") || path === "/onboarding";
  if (needsAccount && !data.user) {
    const to = request.nextUrl.clone();
    to.pathname = "/sign-in";
    to.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // Everything except static files, images and the agent stream.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/agent|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
