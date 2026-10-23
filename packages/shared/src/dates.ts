/**
 * FPL deadlines and price changes are UK local time, but GitHub cron and every
 * timestamp we store are UTC. Snapshot dates are UK calendar dates so that a
 * "day" means what a manager in the UK thinks it means.
 */
export function ukDate(instant: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD, which is what Postgres wants for a date literal.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The UK calendar date `days` before the given instant. */
export function ukDateMinus(days: number, instant: Date = new Date()): string {
  return ukDate(new Date(instant.getTime() - days * 86_400_000));
}

/** "Saturday 24 October, 11:00 UK time" — how a manager reads a deadline. */
export function ukDeadlineLabel(deadlineUtc: string): string {
  const instant = new Date(deadlineUtc);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return `${day.replace(",", "")}, ${time} UK time`;
}
