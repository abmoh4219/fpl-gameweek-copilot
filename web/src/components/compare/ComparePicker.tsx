"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { normalizeName } from "@fpl/shared";
import { SERIES } from "../charts/RadarChart";

export interface PickOption {
  id: number;
  name: string;
  team: string;
  position: string;
}

const MAX = 3;

/** Pick up to three players; the choice lives in the address, so the page (and its card) can be shared. */
export function ComparePicker({ options, selected }: { options: PickOption[]; selected: number[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const indexed = useMemo(() => options.map((o) => ({ o, key: normalizeName(`${o.name} ${o.team}`) })), [options]);
  const matches = useMemo(() => {
    const q = normalizeName(query.trim());
    if (q.length < 2) return [];
    return indexed.filter(({ o, key }) => key.includes(q) && !selected.includes(o.id)).slice(0, 8).map(({ o }) => o);
  }, [indexed, query, selected]);

  const go = (ids: number[]) => router.push(ids.length ? `/compare?p=${ids.join(",")}` : "/compare", { scroll: false });

  return (
    <div className="cmp-picker">
      <ul className="cmp-chosen" aria-label="Players being compared">
        {selected.map((id, i) => {
          const o = byId.get(id);
          return o ? (
            <li key={id} style={{ ["--c" as string]: SERIES[i] }}>
              <i aria-hidden="true" />
              {o.name}
              <button type="button" aria-label={`Remove ${o.name}`} onClick={() => go(selected.filter((x) => x !== id))}>
                ×
              </button>
            </li>
          ) : null;
        })}
      </ul>
      {selected.length < MAX && (
        <div className="cmp-search">
          <label htmlFor="cmp-q" className="sr-only">
            Add a player
          </label>
          <input
            id="cmp-q"
            type="search"
            autoComplete="off"
            placeholder={selected.length === 0 ? "Search a player to compare" : "Add another player"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <ul className="cmp-matches" role="listbox" aria-label="Matching players">
              {matches.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      go([...selected, o.id]);
                    }}
                  >
                    <b>{o.name}</b>
                    <span>
                      {o.team} · {o.position}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
