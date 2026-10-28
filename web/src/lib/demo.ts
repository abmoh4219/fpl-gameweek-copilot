/**
 * The demo (docs/product-plan.md C4): the demo team, four fixed questions,
 * no typing. Each answer is recorded ONCE PER GAMEWEEK and replayed to every
 * visitor, so the whole demo costs four agent runs a gameweek — about five a
 * month — no matter how many people try it. The agent key is small; this is
 * the line that protects it.
 */
export const DEMO_QUESTIONS = [
  "Who should I captain this week?",
  "Is anyone in my squad injured or doubtful?",
  "Who is my weakest starter, and who could replace them within my budget?",
  "Which of my players have the hardest next five fixtures?",
] as const;
