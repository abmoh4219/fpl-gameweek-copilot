import { hasAnthropicKey } from "@fpl/agent";
import type { AgentEvent, Squad } from "@fpl/shared";
import raw from "./demo-snapshot.json";

/**
 * The frozen demo: the demo squad and its four answers, saved together by
 * web/scripts/snapshot-demo.ts so every plan matches the pitch it was made on.
 * Used only when the site has no ANTHROPIC_API_KEY and cannot record.
 */
export interface DemoSnapshot {
  recordedAt: string;
  squad: Squad;
  answers: AgentEvent[][];
}

/** The snapshot, when the demo should replay it instead of recording. */
export function frozenDemo(): DemoSnapshot | null {
  return hasAnthropicKey() ? null : (raw as unknown as DemoSnapshot);
}
