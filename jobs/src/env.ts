import { z } from "zod";

/**
 * Config for the sample fetcher. Parsed with Zod so a typo fails loudly
 * instead of producing a 404 sample.
 *
 * FOOTBALL_DATA_API_TOKEN is optional on purpose: the Champions League data is
 * enrichment, and optional data must never break the core run (CLAUDE.md §10).
 */
const EnvSchema = z.object({
  FPL_ENTRY_ID: z
    .string()
    .regex(/^\d+$/, "FPL_ENTRY_ID must be the numeric id from your FPL team URL"),
  FOOTBALL_DATA_API_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse({
    FPL_ENTRY_ID: process.env["FPL_ENTRY_ID"],
    FOOTBALL_DATA_API_TOKEN: process.env["FOOTBALL_DATA_API_TOKEN"] || undefined,
  });

  if (!parsed.success) {
    // Prints field names and messages only — never values.
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  return parsed.data;
}
