import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeNext } from "@/lib/auth/env";
import { getViewer } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Log in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getViewer()) redirect(next);

  return (
    <div className="auth-card">
      <span className="auth-kicker">Welcome back</span>
      <h1 className="auth-title">
        Log in to <em>Armband</em>
      </h1>
      <p className="auth-sub">Your squad and the Gaffer are where you left them.</p>
      <AuthForm mode="sign-in" next={next} initialError={error === "oauth" ? "Google sign-in didn't complete. Please try again." : null} />
    </div>
  );
}
