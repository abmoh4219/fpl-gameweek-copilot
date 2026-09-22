import { z } from "zod";

/**
 * FPL sends season totals as strings ("0.83") and per-90 values as numbers.
 * Every string-number is converted at the schema boundary so no arithmetic
 * ever touches a raw string (CLAUDE.md §5).
 */
export const numericString = z
  .string()
  .refine((v) => v.trim() !== "" && Number.isFinite(Number(v)), {
    message: "expected a numeric string",
  })
  .transform(Number);

/** ISO-8601 timestamp, kept as a string; parsing to Date is a caller's choice. */
export const isoDateTime = z.string().min(1);
