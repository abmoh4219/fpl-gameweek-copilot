"use client";

import { useState } from "react";
import { kitImageUrl, type Kit as KitColours } from "@fpl/shared";
import { Shirt } from "../Shirt";

/**
 * The official club kit, loaded from FPL's image server (ADR-0010) and never
 * copied into this repo. If it fails to load, our own drawn shirt in the
 * club's colours takes its place, so the pitch never shows a broken image.
 */
export function Kit({
  teamCode,
  isKeeper,
  team,
  fallback,
  id,
  className = "kit",
}: {
  teamCode: number;
  isKeeper: boolean;
  team: string;
  fallback: KitColours;
  id: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={className} style={{ display: "block" }}>
        <Shirt kit={fallback} label={isKeeper ? "GK" : team} id={id} />
      </span>
    );
  }
  return (
    // A plain <img>: these are tiny remote webp files, and Next's image
    // optimiser would spend the free plan's quota re-encoding them.
    <img
      className={className}
      src={kitImageUrl(teamCode, isKeeper)}
      alt={`${team} ${isKeeper ? "goalkeeper " : ""}kit`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
