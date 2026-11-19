import type { Metadata } from "next";
import { CompareView, compareMetadata } from "./view";

// The empty picker; a comparison (?p=) is rewritten to /compare/with/<ids> (ADR-0025).
export const revalidate = 3600;
export const metadata: Metadata = compareMetadata([]);

export default function Compare() {
  return <CompareView chosen={[]} />;
}
