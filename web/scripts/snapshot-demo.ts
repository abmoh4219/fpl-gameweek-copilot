/**
 * Freeze the demo: save the demo squad and its four recorded answers into
 * src/lib/demo-snapshot.json. With no ANTHROPIC_API_KEY, /demo replays this
 * snapshot instead of recording (docs/agent.md, "When the key is gone").
 *
 * The answers are read from the live site, where they are already cached for
 * this gameweek, so this costs no agent runs. The squad is loaded from the same
 * sources the site uses, so the plans in the answers match the pitch.
 *
 *   cd web && NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… \
 *     ../jobs/node_modules/.bin/tsx scripts/snapshot-demo.ts [https://armband-one.vercel.app]
 */
import { writeFileSync } from "node:fs";
import type { AgentEvent } from "@fpl/shared";
import { DEMO_TEAM_ID } from "../src/components/site/links.ts";
import { DEMO_QUESTIONS } from "../src/lib/demo.ts";
import type { DemoSnapshot } from "../src/lib/demo-snapshot.ts";
import { loadSquad } from "../src/lib/squad.ts";

const site = process.argv[2] ?? "https://armband-one.vercel.app";

const squad = await loadSquad(DEMO_TEAM_ID);
const answers: AgentEvent[][] = [];
for (let q = 0; q < DEMO_QUESTIONS.length; q++) {
  const res = await fetch(`${site}/api/demo?q=${q}`);
  const events = (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AgentEvent);
  if (!events.some((e) => e.type === "done") || events.some((e) => e.type === "error")) {
    throw new Error(`question ${q} has no complete recording on ${site}; open /demo, click it once, and retry`);
  }
  answers.push(events);
}

const snapshot: DemoSnapshot = { recordedAt: new Date().toISOString(), squad, answers };
writeFileSync(new URL("../src/lib/demo-snapshot.json", import.meta.url), `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Saved GW${squad.gameweek}: ${squad.teamName}, ${answers.length} answers.`);
