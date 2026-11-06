"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readMyTeam, type MyTeam } from "@/lib/my-team";

/**
 * The landing page's one action: type your FPL team ID (or paste your Points
 * page address) and your dugout opens. No sign-up. The team page itself shows
 * the team's name and offers "This is my team", so no extra step is needed.
 */
function parseTeam(raw: string): number | null {
  const text = raw.trim();
  const fromUrl = /\/entry\/(\d{1,9})(?:\/|$|\?)/.exec(text);
  const digits = fromUrl ? fromUrl[1]! : text;
  if (!/^\d{1,9}$/.test(digits)) return null;
  const id = Number(digits);
  return id > 0 ? id : null;
}

export function TeamIdBox({ id = "team-id", center = false }: { id?: string; center?: boolean }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [mine, setMine] = useState<MyTeam | null>(null);

  useEffect(() => setMine(readMyTeam()), []);

  function open(e: React.FormEvent) {
    e.preventDefault();
    const team = parseTeam(raw);
    if (!raw.trim()) {
      setError("Type your FPL team ID first. It's the number after /entry/ on your FPL Points page.");
      return;
    }
    if (team === null) {
      setError("That isn't a team ID. It's the number after /entry/ in your FPL Points page address.");
      return;
    }
    setError(null);
    setOpening(true);
    router.push(`/team/${team}`);
  }

  return (
    <div className={`idbox${center ? " center" : ""}`}>
      <form className="idbox-form" onSubmit={open} noValidate>
        <label htmlFor={id} className="sr-only">
          Your FPL team ID
        </label>
        <input
          id={id}
          className="idbox-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Your FPL team ID"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
        />
        <button type="submit" className="btn btn-accent idbox-go" disabled={opening}>
          {opening ? <span className="spinner" /> : "Open my team"}
        </button>
      </form>
      <p className={`idbox-help${error ? " is-error" : ""}`} id={`${id}-help`} role={error ? "alert" : undefined}>
        {error ??
          (mine ? (
            <>
              Or continue to <Link href={`/team/${mine.id}`}>{mine.name}</Link>
            </>
          ) : (
            <>
              The number after /entry/ on your FPL Points page. <Link href="/team">Where do I find it?</Link>
            </>
          ))}
      </p>
    </div>
  );
}
