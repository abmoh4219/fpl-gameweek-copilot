import { INSIGHT_CONFIG } from "../insights/config.ts";

/**
 * Drafts for X, written automatically and published MANUALLY (ADR-0002).
 *
 * A draft has to earn a click: a hook, then two or three CONCRETE numbers
 * that came from the payload. No hashtag spam, no invented stats, and hard
 * capped so it is postable without editing.
 */
export function buildXPost(hook: string, facts: readonly string[], tail?: string): string {
  const cap = INSIGHT_CONFIG.report.maxXPostChars;
  const chosen: string[] = [];

  // Take facts while they fit, so the result is never mid-sentence.
  for (const fact of facts.slice(0, 3)) {
    const candidate = [hook, [...chosen, fact].join(" · "), tail].filter(Boolean).join("\n");
    if (candidate.length <= cap) chosen.push(fact);
  }

  const post = [hook, chosen.join(" · "), tail].filter(Boolean).join("\n");
  return post.length <= cap ? post : post.slice(0, cap - 1).trimEnd() + "…";
}
