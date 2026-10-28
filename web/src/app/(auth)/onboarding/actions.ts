"use server";

import { redirect } from "next/navigation";
import { fetchEntry, FplUnavailableError, parseTeamInput, TeamNotFoundError } from "@/lib/fpl";
import { createAuthClient } from "@/lib/auth/server";
import { loadSquad } from "@/lib/squad";

export interface TeamPreview {
  id: number;
  teamName: string;
  managerName: string;
  points: number | null;
  rank: number | null;
  startedEvent: number;
  /** The fifteen, starters first, for the "Is this you?" card. Empty before GW1. */
  kits: { fplId: number; teamCode: number; keeper: boolean; name: string; captain: boolean }[];
}

export type PreviewResult = { ok: true; team: TeamPreview } | { ok: false; error: string };

async function signedIn(): Promise<boolean> {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getUser();
  return data.user !== null;
}

function managerName(entry: { player_first_name: string; player_last_name: string }) {
  return `${entry.player_first_name} ${entry.player_last_name}`.trim();
}

/** Look a team up on FPL so the manager can confirm it is theirs. */
export async function previewTeam(raw: string): Promise<PreviewResult> {
  if (!(await signedIn())) return { ok: false, error: "Your session has ended. Log in again." };
  const id = parseTeamInput(raw);
  if (id === null) {
    return { ok: false, error: "That isn't a team ID. It's the number after /entry/ in your FPL Points page address." };
  }
  try {
    const entry = await fetchEntry(id);
    let kits: TeamPreview["kits"] = [];
    try {
      const squad = await loadSquad(id);
      kits = [...squad.starters, ...squad.bench].map((p) => ({
        fplId: p.fplId,
        teamCode: p.teamCode,
        keeper: p.position === "GKP",
        name: p.webName,
        captain: p.isCaptain,
      }));
    } catch {
      // Kits are a nicety (none before a team's first gameweek); the names are what matter.
    }
    return {
      ok: true,
      team: {
        id,
        teamName: entry.name,
        managerName: managerName(entry),
        points: entry.summary_overall_points,
        rank: entry.summary_overall_rank,
        startedEvent: entry.started_event,
        kits,
      },
    };
  } catch (error) {
    if (error instanceof TeamNotFoundError) return { ok: false, error: `FPL has no team with ID ${id}. Check the number and try again.` };
    if (error instanceof FplUnavailableError) {
      return { ok: false, error: "FPL isn't answering right now (it pauses while a gameweek is being scored). Try again in a few minutes." };
    }
    return { ok: false, error: "Something went wrong looking that team up. Please try again." };
  }
}

/**
 * Save the confirmed team. The names are fetched again HERE, on the server,
 * so what is stored is what FPL says — never what the browser sent.
 */
export async function connectTeam(id: number): Promise<{ ok: false; error: string }> {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Your session has ended. Log in again." };
  if (!Number.isInteger(id) || id < 1 || id > 999_999_999) return { ok: false, error: "That team ID isn't valid." };

  let entry;
  try {
    entry = await fetchEntry(id);
  } catch {
    return { ok: false, error: "FPL isn't answering right now. Try again in a few minutes." };
  }
  const { error } = await supabase.rpc("connect_team", {
    p_team_id: id,
    p_team_name: entry.name.slice(0, 60),
    p_manager_name: managerName(entry).slice(0, 80),
  });
  if (error) return { ok: false, error: "We couldn't save your team. Please try again." };
  redirect("/app?welcome=1");
}
