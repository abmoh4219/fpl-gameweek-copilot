import { readFileSync } from "node:fs";
import path from "node:path";

const SAMPLES_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "samples");

/** Load a recorded API response from samples/. */
export function loadSample(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(SAMPLES_DIR, relativePath), "utf8"));
}
