import Link from "next/link";
import { Mark, Wordmark } from "@/components/site/Mark";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import "./team.css";

/** The bar and page around a dugout: the demo team and every manager's own team share it. */
export function TeamShell({ plate, action, children }: { plate?: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="demo">
      <header className="demo-bar">
        <Link href="/" className="mark" aria-label="Armband home">
          <Mark size={26} />
          <Wordmark />
        </Link>
        {plate && <span className="demo-plate">{plate}</span>}
        <nav className="demo-bar-actions" aria-label="Team">
          <Link href="/stats" className="nav-quiet hide-mobile">
            Stats
          </Link>
          <Link href="/players" className="nav-quiet hide-mobile">
            Players
          </Link>
          <ThemeToggle />
          {action}
        </nav>
      </header>
      <main className="page" id="content">
        {children}
      </main>
    </div>
  );
}
