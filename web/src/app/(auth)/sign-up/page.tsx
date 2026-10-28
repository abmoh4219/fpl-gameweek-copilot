import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { getViewer } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUp() {
  if (await getViewer()) redirect("/app");

  return (
    <div className="auth-card">
      <ol className="steps-mini" aria-label="Getting started">
        <li className="on">Account</li>
        <li>Your team</li>
        <li>Kick-off</li>
      </ol>
      <h1 className="auth-title">
        Create your <em>free account</em>
      </h1>
      <p className="auth-sub">Five co-pilot questions included, free. Your squad view and player cards are unlimited. No FPL password, ever.</p>
      <AuthForm mode="sign-up" next="/onboarding" />
      <p className="auth-fine">
        By creating an account you agree to the <Link href="/terms">Terms</Link>. We keep only your login, your team ID
        and a question counter — <Link href="/privacy">Privacy</Link>.
      </p>
    </div>
  );
}
