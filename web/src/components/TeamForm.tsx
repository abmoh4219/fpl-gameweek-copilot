"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_TEAM_ID } from "./Header";

/** Team id entry. Validates locally; the server validates again. */
export function TeamForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(id: string) {
    const clean = id.trim();
    if (!/^\d{1,9}$/.test(clean) || Number(clean) === 0) {
      setError("An FPL team ID is a number, like 7653564. See the guide below to find yours.");
      return;
    }
    setError(null);
    setBusy(true);
    router.push(`/team/${clean}`);
  }

  return (
    <form
      className="team-form"
      onSubmit={(e) => {
        e.preventDefault();
        open(value);
      }}
    >
      <label className="team-input">
        <span>team/</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          placeholder="your FPL team ID"
          aria-label="FPL team ID"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
        />
      </label>
      <button className="btn btn-accent" type="submit" disabled={busy}>
        {busy ? "Opening…" : "Open my team →"}
      </button>
      {error && <p className="form-error">{error}</p>}
      <button type="button" className="demo-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => open(String(DEMO_TEAM_ID))}>
        or try a demo team <code>{DEMO_TEAM_ID}</code> →
      </button>
    </form>
  );
}
