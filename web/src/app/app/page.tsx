import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/server";

/**
 * The old signed-in app (ADR-0017). Someone still holding a session goes
 * straight to their team's dugout once; everyone else finds their team.
 */
export default async function OldApp() {
  const viewer = await getViewer().catch(() => null);
  const id = viewer?.profile?.fpl_team_id;
  redirect(id ? `/team/${id}` : "/team");
}
