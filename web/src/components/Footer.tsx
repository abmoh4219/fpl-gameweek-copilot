import { TELEGRAM_URL } from "./Header";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div style={{ maxWidth: 520 }}>
          Gameweek Copilot is an independent project. Not affiliated with, endorsed by or connected to the
          Premier League or Fantasy Premier League. Uses public data only, with its own visuals. Fixture runs,
          goal threat, captain picks and price movements are <strong className="muted">estimates</strong>, never guarantees.
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">Telegram channel</a>
          <a href="/#guide">How to use</a>
          <span className="mono">Agent · Claude Haiku 5.5</span>
        </div>
      </div>
    </footer>
  );
}
