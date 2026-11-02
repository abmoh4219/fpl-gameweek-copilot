/**
 * The repository's star count, for the header's GitHub pill. One unauthenticated
 * GitHub API call, cached for an hour on the server, so visitors never call
 * GitHub (CLAUDE.md §7). Null when GitHub doesn't answer; the pill then shows
 * "Star" alone.
 */
export async function repoStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/abmoh4219/fpl-gameweek-copilot", {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const stars = (body as { stargazers_count?: unknown }).stargazers_count;
    return typeof stars === "number" ? stars : null;
  } catch {
    return null;
  }
}

export function compactCount(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
}
