/**
 * The Gaffer, as a library the website runs in-process (ADR-0014).
 */
export { runGaffer, turnCostUsd, type GafferInput, type GafferOptions } from "./gaffer.ts";
export { usageToday } from "./limits.ts";
export { MODEL, hasAnthropicKey } from "./config.ts";
