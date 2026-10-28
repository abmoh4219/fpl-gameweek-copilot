"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserAuthClient } from "@/lib/auth/browser";

type Mode = "sign-in" | "sign-up";

/** Supabase's messages are written for developers; these are for managers. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Check both and try again.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "There is already an account with this email. Log in instead.";
  if (m.includes("password should be") || m.includes("at least")) return "Use a password of at least 8 characters.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider"))
    return "Google sign-in isn't switched on yet. Use your email and a password for now.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("email") && m.includes("invalid")) return "That doesn't look like an email address.";
  if (m.includes("fetch")) return "We couldn't reach the sign-in service. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function AuthForm({ mode, next, initialError }: { mode: Mode; next: string; initialError?: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sent, setSent] = useState(false);

  const signUp = mode === "sign-up";

  async function withGoogle() {
    setError(null);
    setBusy("google");
    const supabase = createBrowserAuthClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // On success the browser is already leaving for Google.
    if (err) {
      setError(friendly(err.message));
      setBusy(null);
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    setError(null);
    setBusy("email");
    const supabase = createBrowserAuthClient();
    try {
      if (signUp) {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            ...(name.trim() ? { data: { full_name: name.trim() } } : {}),
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (err) throw err;
        // With email confirmation off (our setting) a session comes back at once.
        if (!data.session) {
          setSent(true);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  }

  if (sent) {
    return (
      <div className="notice ok" role="status">
        Check your inbox: we sent a link to <b>{email}</b>. Open it on this device to finish creating your account.
      </div>
    );
  }

  return (
    <div className="form">
      <button type="button" className="btn btn-google btn-block" onClick={() => void withGoogle()} disabled={busy !== null}>
        {busy === "google" ? <span className="spinner" /> : <GoogleG />}
        Continue with Google
      </button>

      <div className="or">or with email</div>

      <form className="form" onSubmit={(e) => void withEmail(e)} noValidate>
        {signUp && (
          <div className="field">
            <label htmlFor="name">
              Your name <span className="faint">optional</span>
            </label>
            <input id="name" className="input" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="How should we greet you?" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="input-wrap">
            <input
              id="password"
              className="input"
              type={show ? "text" : "password"}
              autoComplete={signUp ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signUp ? "At least 8 characters" : "Your password"}
              style={{ paddingRight: 64 }}
            />
            <button type="button" className="input-action" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-accent btn-block" disabled={busy !== null || !email || !password}>
          {busy === "email" ? <span className="spinner" /> : signUp ? "Create account" : "Log in"}
        </button>
      </form>

      <p className="auth-switch">
        {signUp ? (
          <>
            Already have an account? <Link href={`/sign-in${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</Link>
          </>
        ) : (
          <>
            New to Armband? <Link href="/sign-up">Create a free account</Link>
          </>
        )}
      </p>
    </div>
  );
}
