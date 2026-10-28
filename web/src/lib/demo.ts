/**
 * The demo (docs/agent.md): the demo team, four fixed questions,
 * no typing. Each answer is recorded ONCE PER GAMEWEEK and replayed to every
 * visitor, so the whole demo costs four agent runs a gameweek — about five a
 * month — no matter how many people try it. The agent key is small; this is
 * the line that protects it.
 */
/** Chosen to show the co-pilot ACTING: it picks, rates and transfers on the pitch. */
export const DEMO_QUESTIONS = [
  "Pick my best XI and captain for this gameweek",
  "Rate my lineup out of 10",
  "Make one transfer to improve my team",
  "Is anyone in my squad injured or doubtful?",
] as const;

/** Suggestions in the live co-pilot: the same mix of actions and questions. */
export const LIVE_SUGGESTIONS = [
  "Pick my best XI and captain for this gameweek",
  "Rate my lineup out of 10",
  "Make one transfer to improve my team",
  "Who should I captain this week?",
] as const;
