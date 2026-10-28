import Link from "next/link";
import type { SiteCard } from "@fpl/shared";
import { DEMO_TEAM_ID, TELEGRAM_URL } from "@/components/Header";
import { TeamForm } from "@/components/TeamForm";
import { readView } from "@/lib/supabase";

export const revalidate = 900;

const QUESTIONS = [
  "Who should I captain this week?",
  "Who is my weakest player, and who replaces him within my budget?",
  "Which of my players has the hardest next 5 fixtures?",
  "Is anyone in my squad injured or doubtful?",
  "Find me a differential midfielder under £7.0m",
];

interface CardRow {
  fpl_id: number;
  card: SiteCard;
  updated_at: string;
}

async function landingData() {
  try {
    const [top, ids] = await Promise.all([
      readView<CardRow>("player_cards", "select=fpl_id,card,updated_at&order=card->ownership.desc&limit=1"),
      readView<{ fpl_id: number }>("player_cards", "select=fpl_id"),
    ]);
    return { star: top[0] ?? null, players: ids.length };
  } catch {
    return { star: null, players: null };
  }
}

function minutesAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return mins < 90 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
}

export default async function Home() {
  const { star, players } = await landingData();
  const c = star?.card;
  const next = c?.fixturesLong.fixtures[0];

  const trace: [string, string][] = c
    ? [
        ["get_my_squad()", "15 players · bank & value"],
        [`get_player("${c.webName}")`, `${c.xgiPer90.toFixed(2)} xGI/90 · minutes risk ${c.minutesRisk.band}`],
        [`get_fixture_runs(["${c.team}"])`, `${c.fixturesLong.band} run · next ${next?.opponent ?? "—"}${next ? (next.isHome ? " (H)" : " (A)") : ""}`],
        ['search_players({ position: "FWD", sortBy: "form" })', "5 options"],
      ]
    : [
        ["get_my_squad()", "15 players · bank & value"],
        ['get_player("…")', "card"],
        ["get_fixture_runs()", "runs"],
      ];

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <div className="hero-grid">
          <div>
            <span className="live eyebrow">
              <i className="dot" />
              {star ? `Live FPL data · synced ${minutesAgo(star.updated_at)}` : "Live FPL data"}
            </span>
            <h1 className="h1">
              <span className="grad">Your FPL squad,</span>
              <br />
              read by an agent
              <br />
              <span className="accent">that shows its work.</span>
            </h1>
            <p className="lede">
              Enter your team ID. See your squad on the pitch, then ask anything — captaincy, transfers, fixtures.
              The agent answers only with numbers our pipeline computed, and you watch every tool call it makes.
            </p>
            <TeamForm />
          </div>

          <div className="terminal" aria-label="Example of the agent answering">
            <div className="terminal-bar">
              <span className="terminal-dots">
                <i />
                <i />
                <i />
              </span>
              <span>copilot · agent trace</span>
              <span className="accent">● live numbers</span>
            </div>
            <div className="terminal-body">
              <div className="t-line" style={{ animationDelay: "0.2s" }}>
                <span className="t-sym">›</span>
                <span className="t-q">{c ? `Should I captain ${c.webName}?` : "Who should I captain?"}</span>
                <span />
              </div>
              {trace.map(([call, res], i) => (
                <div className="t-line" key={call} style={{ animationDelay: `${0.8 + i * 0.55}s` }}>
                  <span className="t-sym">▸</span>
                  <span className="t-call">{call}</span>
                  <span className="t-res">{res}</span>
                </div>
              ))}
              <div className="t-answer" style={{ animationDelay: `${1.1 + trace.length * 0.55}s` }}>
                {c ? (
                  <>
                    The case for <strong>{c.webName}</strong>: {c.xgiPer90.toFixed(2)} xGI per 90,{" "}
                    {c.minutesRisk.band.toLowerCase()} minutes risk
                    {c.goalThreat.onPenalties ? ", on penalties" : ""}, {c.fixturesLong.band.toLowerCase()} fixture run.{" "}
                    <span className="muted">Estimate — not a guarantee.</span>
                  </>
                ) : (
                  "Answers cite the exact numbers the tools returned."
                )}
                <span className="cursor" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- stats */}
      <section className="section" style={{ paddingTop: 0, paddingBottom: 0, borderTop: "1px solid var(--line)" }}>
        <div className="cells cells-4" style={{ margin: "40px 0" }}>
          <div className="stat">
            <div className="stat-value">{players ?? "667"}</div>
            <div className="stat-label">players scored every 3 hours</div>
          </div>
          <div className="stat">
            <div className="stat-value">8</div>
            <div className="stat-label">read-only tools the agent can call</div>
          </div>
          <div className="stat">
            <div className="stat-value">5 GW</div>
            <div className="stat-label">fixture runs, adjusted for opponent strength</div>
          </div>
          <div className="stat">
            <div className="stat-value accent">0</div>
            <div className="stat-label">numbers invented by AI — code computes them all</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section className="section" id="how">
        <div className="section-label">
          <b>01</b> / how it works
        </div>
        <h2 className="h2">
          A data pipeline first.
          <br />
          <span className="muted">An agent on top.</span>
        </h2>
        <p className="lede">
          Most AI football tools are a chat box guessing from memory. This one runs on a pipeline that syncs Fantasy
          Premier League every three hours, computes every metric in tested code, and only then lets an agent read it.
        </p>

        <div className="pipeline" style={{ marginTop: 40 }}>
          {[
            ["01", "Watch", "FPL synced every 3 h; a snapshot per run in Postgres."],
            ["02", "Detect", "Price moves, injuries and news diffed against the last run."],
            ["03", "Decide", "Form, xGI/90, minutes risk, fixture runs — pure, tested functions."],
            ["04", "Deliver", "Daily reports and injury alerts to Telegram, automatically."],
            ["05", "Explain", "Pre-deadline previews; AI prose is checked by code before posting."],
          ].map(([k, t, d]) => (
            <div className="pipe" key={k}>
              <div className="pipe-k">{k}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
          <div className="pipe pipe-new">
            <div className="pipe-k">06 · new</div>
            <h3>Ask</h3>
            <p>A Claude agent with 8 read-only tools, answering about your own squad.</p>
          </div>
        </div>

        <div className="cells cells-3" style={{ marginTop: 24 }}>
          <div className="cell spotlight">
            <div className="cell-num">tools, not memory</div>
            <h3 className="h3">It looks things up</h3>
            <p>
              Squad, player cards, fixture runs, price watch, previews. The agent decides which to call; you see each
              call and its result as it happens.
            </p>
          </div>
          <div className="cell spotlight">
            <div className="cell-num">rules in code</div>
            <h3 className="h3">Transfers are checked</h3>
            <p>
              Before recommending a move, the agent runs <span className="kbd">check_transfer</span>: positions, the
              three-per-club limit and your bank, all enforced by code.
            </p>
          </div>
          <div className="cell spotlight">
            <div className="cell-num">honest by design</div>
            <h3 className="h3">Estimates say so</h3>
            <p>
              Anything forward-looking — fixtures, goal threat, price moves — is labelled an estimate. The agent can
              explain numbers; it cannot make them up.
            </p>
          </div>
        </div>

        <div className="veto">
          <div className="mono faint" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            the rule, enforced
          </div>
          <div>
            “Haaland has 0.94 xGI per 90 <del>and has scored 14 goals already</del>.”{" "}
            <span className="faint">— rejected: 14 is not in the facts it was given.</span>
          </div>
          <div className="ok">Numbers come from tools. The model only writes the words around them.</div>
        </div>
      </section>

      {/* ------------------------------------------------------------ guide */}
      <section className="section" id="guide">
        <div className="section-label">
          <b>02</b> / how to use
        </div>
        <div className="guide">
          <div>
            <h2 className="h2">Three steps. About thirty seconds.</h2>
            <p className="lede">No account, no login. Your FPL team ID is public, so that is all the copilot needs.</p>
            <div style={{ marginTop: 28 }}>
              <Link href={`/team/${DEMO_TEAM_ID}`} className="btn btn-primary">
                Open the demo team →
              </Link>
            </div>
          </div>

          <div className="steps">
            <div className="step">
              <span className="step-n">1</span>
              <div>
                <h3>Find your team ID</h3>
                <p>
                  On <span className="kbd">fantasy.premierleague.com</span>, open <strong>Points</strong>. The number
                  after <code>/entry/</code> in the address bar is your ID.
                </p>
                <div className="url-demo">
                  fantasy.premierleague.com/entry/<b>7653564</b>/event/8
                </div>
                <p style={{ marginTop: 10 }}>
                  In the FPL app: <strong>Points</strong> → share your team; the same number is in the link.
                </p>
              </div>
            </div>
            <div className="step">
              <span className="step-n">2</span>
              <div>
                <h3>Open your team</h3>
                <p>
                  Paste it above. Your squad appears on the pitch: captain, bench, injury flags, this gameweek&apos;s
                  points, and the next five fixtures by difficulty. Tap any player for their full card.
                </p>
              </div>
            </div>
            <div className="step">
              <span className="step-n">3</span>
              <div>
                <h3>Ask the agent</h3>
                <p>
                  Ask in plain English. Watch the trace: every tool it calls, and what came back. Players it talks
                  about light up on your pitch — red to sell, green to bring in.
                </p>
                <div className="question-list">
                  {QUESTIONS.map((q) => (
                    <Link key={q} className="chip" href={`/team/${DEMO_TEAM_ID}?q=${encodeURIComponent(q)}`}>
                      {q}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <div className="step">
              <span className="step-n">i</span>
              <div>
                <h3>Good to know</h3>
                <p>
                  Each visitor gets a few questions a day — this is a demo on a small budget. Numbers refresh every
                  three hours. Selling prices are estimates: FPL keeps half of any rise, and your purchase prices are
                  private.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- telegram */}
      <section className="section">
        <div className="cells cells-2">
          <div className="cell spotlight" style={{ padding: 32 }}>
            <div className="section-label" style={{ marginBottom: 14 }}>
              <b>03</b> / always on
            </div>
            <h2 className="h2" style={{ fontSize: "clamp(24px,3vw,34px)" }}>
              The same pipeline posts to Telegram, every day.
            </h2>
            <p className="lede" style={{ fontSize: 15 }}>
              Overnight price changes as player cards, injury news before the deadline, and an AI-written gameweek
              preview whose every number was checked by code.
            </p>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginTop: 22 }}>
              Join @fpl_gw_copilot
            </a>
          </div>
          <div className="cell" style={{ padding: 32 }}>
            <div className="terminal" style={{ boxShadow: "none" }}>
              <div className="terminal-bar">
                <span>@fpl_gw_copilot</span>
                <span>today</span>
              </div>
              <div className="terminal-body" style={{ fontFamily: "var(--font-sans)", fontSize: 13.5 }}>
                <div style={{ fontWeight: 600 }}>FPL team news (2)</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  • <strong className="accent">Doubtful</strong> — 50% chance, foot injury
                  <br />• <strong style={{ color: "var(--danger)" }}>Injured</strong> — 0% chance, thigh injury
                </div>
                <div className="faint mono" style={{ marginTop: 12, fontSize: 11 }}>
                  price report 02:37 · news alerts as they land · preview before each deadline
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
