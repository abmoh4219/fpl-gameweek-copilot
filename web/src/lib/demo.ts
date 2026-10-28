/**
 * The demo (docs/product-plan.md C4): the demo team, four fixed questions,
 * no typing. Each answer is recorded once per UK day and replayed to every
 * visitor, so the demo costs four agent runs a day no matter how many
 * people try it.
 */
export const DEMO_QUESTIONS = [
  "Who should I captain this week?",
  "Is anyone in my squad injured or doubtful?",
  "Who is my weakest starter, and who could replace them within my budget?",
  "Which of my players have the hardest next five fixtures?",
] as const;

export const ukDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
