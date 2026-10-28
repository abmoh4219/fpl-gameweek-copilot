/**
 * The broadcast ticker under the hero: the pipeline's overnight report as a
 * scrolling line — price rises and falls, injury and availability news.
 * Pure CSS motion; the second copy only exists to make the loop seamless.
 */
export interface TickerItem {
  key: string;
  name: string;
  detail: string;
  tone: "up" | "down" | "warn";
  kit: string | null;
}

function Items({ items, hidden }: { items: TickerItem[]; hidden?: boolean }) {
  return (
    <ul className="ticker-list" aria-hidden={hidden}>
      {items.map((it) => (
        <li key={it.key} className={`ticker-item ${it.tone}`}>
          {it.kit && <img src={it.kit} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <b>{it.name}</b>
          <span>{it.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function Ticker({ label, items }: { label: string; items: TickerItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ticker" role="region" aria-label={`${label}: today's FPL changes`}>
      <span className="ticker-label">{label}</span>
      <div className="ticker-track">
        <div className="ticker-move" style={{ animationDuration: `${Math.max(24, items.length * 5)}s` }}>
          <Items items={items} />
          <Items items={items} hidden />
        </div>
      </div>
    </div>
  );
}
