import type { Metadata } from "next";
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
      <p className="auth-sub">Ten co-pilot questions a day, free while we&apos;re in early access. No FPL password, ever.</p>
      <AuthForm mode="sign-up" next="/onboarding" />
    </div>
  );
}
