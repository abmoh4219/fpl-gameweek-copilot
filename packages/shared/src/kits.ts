/**
 * Club colours for our own drawn shirt — the FALLBACK when an official kit
 * image fails to load (ADR-0010: official kits are loaded from FPL's server,
 * never copied). Keyed by FPL team `code`, which is stable across seasons;
 * team `id` is not (CLAUDE.md §5).
 */
export type KitPattern = "solid" | "stripes" | "sleeves";

export interface Kit {
  /** Body colour. */
  primary: string;
  /** Stripes, sleeves or trim. */
  secondary: string;
  pattern: KitPattern;
  /** Chest text colour, chosen for contrast on `primary`. */
  ink: string;
}

const KITS: Record<number, Kit> = {
  1: { primary: "#DA291C", secondary: "#FFFFFF", pattern: "solid", ink: "#FFFFFF" }, // MUN
  2: { primary: "#F4F4F4", secondary: "#1D428A", pattern: "solid", ink: "#1D428A" }, // LEE
  3: { primary: "#EF0107", secondary: "#FFFFFF", pattern: "sleeves", ink: "#FFFFFF" }, // ARS
  4: { primary: "#1B1B1B", secondary: "#F4F4F4", pattern: "stripes", ink: "#FFFFFF" }, // NEW
  6: { primary: "#F4F4F4", secondary: "#132257", pattern: "solid", ink: "#132257" }, // TOT
  7: { primary: "#670E36", secondary: "#95BFE5", pattern: "sleeves", ink: "#FFFFFF" }, // AVL
  8: { primary: "#034694", secondary: "#FFFFFF", pattern: "solid", ink: "#FFFFFF" }, // CHE
  9: { primary: "#78B9E6", secondary: "#FFFFFF", pattern: "solid", ink: "#0B2A4A" }, // COV
  11: { primary: "#003399", secondary: "#FFFFFF", pattern: "solid", ink: "#FFFFFF" }, // EVE
  14: { primary: "#C8102E", secondary: "#F6EB61", pattern: "solid", ink: "#FFFFFF" }, // LIV
  17: { primary: "#DD0000", secondary: "#FFFFFF", pattern: "solid", ink: "#FFFFFF" }, // NFO
  31: { primary: "#1B458F", secondary: "#C4122E", pattern: "stripes", ink: "#FFFFFF" }, // CRY
  36: { primary: "#0057B8", secondary: "#F4F4F4", pattern: "stripes", ink: "#FFFFFF" }, // BHA
  40: { primary: "#3A64A3", secondary: "#FFFFFF", pattern: "solid", ink: "#FFFFFF" }, // IPS
  43: { primary: "#6CABDD", secondary: "#1C2C5B", pattern: "solid", ink: "#1C2C5B" }, // MCI
  54: { primary: "#F4F4F4", secondary: "#111111", pattern: "solid", ink: "#111111" }, // FUL
  56: { primary: "#EB172B", secondary: "#F4F4F4", pattern: "stripes", ink: "#FFFFFF" }, // SUN
  88: { primary: "#F5A12D", secondary: "#141414", pattern: "stripes", ink: "#141414" }, // HUL
  91: { primary: "#DA291C", secondary: "#121212", pattern: "stripes", ink: "#FFFFFF" }, // BOU
  94: { primary: "#E30613", secondary: "#F4F4F4", pattern: "stripes", ink: "#FFFFFF" }, // BRE
};

/** One generic keeper shirt for every club — ours, not a club's. */
export const KEEPER_KIT: Kit = { primary: "#C6F432", secondary: "#1A1A1A", pattern: "solid", ink: "#1A1A1A" };

/** Neutral fallback for a club this table does not know yet (promoted sides). */
const UNKNOWN_KIT: Kit = { primary: "#3A3A3A", secondary: "#8A8A8A", pattern: "solid", ink: "#FFFFFF" };

export function kitFor(teamCode: number, position: string): Kit {
  if (position === "GKP") return KEEPER_KIT;
  return KITS[teamCode] ?? UNKNOWN_KIT;
}

/**
 * The official kit image on FPL's own server (ADR-0010) — loaded from source,
 * never copied. Keepers have their own kit (`_1`). Sizes FPL serves: 66, 110, 220.
 */
export function kitImageUrl(teamCode: number, isKeeper: boolean, size: 66 | 110 | 220 = 110): string {
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}${isKeeper ? "_1" : ""}-${size}.webp`;
}
