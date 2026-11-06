/**
 * The manager's own team, remembered in THIS browser only (ADR-0017): there
 * are no accounts, so nothing about a visitor is stored on our side. Storage
 * can be blocked (private mode); the site then simply forgets between visits.
 */
export interface MyTeam {
  id: number;
  name: string;
}

const KEY = "armband:my-team";

export function readMyTeam(): MyTeam | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<MyTeam>;
    return typeof v.id === "number" && Number.isInteger(v.id) && v.id > 0 && typeof v.name === "string" ? { id: v.id, name: v.name.slice(0, 60) } : null;
  } catch {
    return null;
  }
}

export function saveMyTeam(team: MyTeam | null) {
  try {
    if (team) window.localStorage.setItem(KEY, JSON.stringify(team));
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("armband:my-team"));
  } catch {
    // Blocked storage: the team is simply not remembered.
  }
}
