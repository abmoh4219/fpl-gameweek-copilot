import Link from "next/link";
import { kitImageUrl, type ReportPayload, type ReportSection, type Squad } from "@fpl/shared";
import { SquadArt, TraceArt, TransferArt, WatchArt } from "@/components/landing/TacticsArt";
import { Ticker, type TickerItem } from "@/components/landing/Ticker";
import { FplPitch } from "@/components/pitch/FplPitch";
import { ScoreBug } from "@/components/pitch/ScoreBug";
import { TELEGRAM_URL, DEMO_TEAM_ID } from "@/components/site/links";
import { loadSquad } from "@/lib/squad";
import { readView } from "@/lib/supabase";

export const revalidate = 900;

// ------------------------------------------------------------------- data --

/** Who is flagged right now, most-owned first: the ticker's fallback on a quiet night. */
interface FlaggedRow {
  fpl_id: number;
  team_code: number;
  webName: string;
  position: string;
  status: string;
  chance: number | null;
}

async function landingData() {
  const [squad, reports, teams, flagged] = await Promise.all([
    loadSquad(DEMO_TEAM_ID).catch(() => null),
    readView<{ report_type: string; payload: ReportPayload; created_at: string }>(
      "latest_reports",
      "select=report_type,payload,created_at&report_type=eq.daily",
    ).catch(() => []),
    readView<{ team_short_name: string; team_code: number }>("team_runs", "select=team_short_name,team_code").catch(() => []),
    readView<FlaggedRow>(
      "player_cards",
      "select=fpl_id,team_code,webName:card->>webName,position:card->>position,status:card->>status,chance:card->chanceOfPlayingNextRound" +
        "&card->>status=neq.a&order=card->ownership.desc.nullslast&limit=10",
    ).catch(() => []),
  ]);
  const codes = new Map(teams.map((t) => [t.team_short_name, t.team_code]));
  return { squad, daily: reports[0] ?? null, codes, flagged };
}

type Of<K extends ReportSection["kind"]> = Extract<ReportSection, { kind: K }>;
function section<K extends ReportSection["kind"]>(payload: ReportPayload | undefined, id: string, kind: K): Of<K> | undefined {
  return payload?.sections.find((s): s is Of<K> => s.kind === kind && s.id === id);
}

function overnight(payload: ReportPayload | undefined) {
  const risers = section(payload, "risers", "price_changes")?.items ?? [];
  const fallers = section(payload, "fallers", "price_changes")?.items ?? [];
  const news = payload?.sections.find((s): s is Of<"status_changes"> => s.kind === "status_changes")?.items ?? [];
  return { risers, fallers, news };
}

/**
 * The example answer in the hero, built from the demo squad by CODE: the
 * claim "highest xGI per 90 in your starting XI" is checked here, not
 * written by hand.
 */
function captainCase(squad: Squad) {
  const options = squad.starters.filter((p) => p.position !== "GKP" && p.minutesRisk !== "High");
  const best = [...options].sort((a, b) => b.xgiPer90 - a.xgiPer90)[0];
  if (!best) return null;
  const next = best.fixtures[0];
  return { best, next: next && !next.isBlank ? `${next.opponent} (${next.isHome ? "H" : "A"})` : null };
}

const Arrow = () => (
  <span className="arrow" aria-hidden="true">
    →
  </span>
);

// -------------------------------------------------------------- sections --

function SectionHead({ index, label, title, sub, center }: { index: string; label: string; title: React.ReactNode; sub?: string; center?: boolean }) {
  return (
    <div className={`sec-head reveal${center ? " center" : ""}`}>
      <span className="sec-kicker">
        <b>{index}</b>
        {label}
      </span>
      <h2 className="display">{title}</h2>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

/** The co-pilot answering, styled as a broadcast analysis card. */
function Analysis({ squad }: { squad: Squad }) {
  const pick = captainCase(squad);
  if (!pick) return null;
  const flagged = [...squad.starters, ...squad.bench].filter((p) => p.status !== "a").length;
  const trace = [
    ["get_my_squad", `15 players · £${squad.bankM.toFixed(1)}m in the bank${flagged ? ` · ${flagged} flagged` : ""}`],
    ["get_player", `${pick.best.webName} · ${pick.best.xgiPer90.toFixed(2)} xGI/90 · ${pick.best.minutesRisk.toLowerCase()} minutes risk`],
    ["get_fixture_runs", `${pick.best.team} · ${pick.best.fixtureBand.toLowerCase()} run${pick.next ? ` · next ${pick.next}` : ""}`],
  ];
  return (
    <div className="analysis" aria-label="Example: the Gaffer answering a question about the demo team">
      <div className="analysis-head">
        <span className="on-air">Gaffer</span>
        <span className="q">Who should I captain this week?</span>
      </div>
      <ol className="analysis-trace">
        {trace.map(([call, res], i) => (
          <li key={call} style={{ animationDelay: `${1.2 + i * 0.45}s` }}>
            <span className="ok" aria-hidden="true">✓</span>
            <code>{call}</code>
            <span className="res">{res}</span>
          </li>
        ))}
      </ol>
      <div className="analysis-answer" style={{ animationDelay: "2.7s" }}>
        <strong>{pick.best.webName}</strong> has the highest xGI per 90 in your starting XI —{" "}
        {pick.best.xgiPer90.toFixed(2)}, with {pick.best.formPoints} points in the last four
        {pick.next ? ` and ${pick.next} next` : ""}. Fixture run: {pick.best.fixtureBand.toLowerCase()}{" "}
        <span className="est">estimate</span>
      </div>
    </div>
  );
}

/** VAR for numbers: how a written preview with an invented figure is handled. */
function VarCheck({ squad }: { squad: Squad }) {
  const pick = captainCase(squad);
  if (!pick) return null;
  const { best } = pick;
  // Only facts that cannot collide with the invented "14" below: a decimal
  // and two words. A whole-number fact of 14 would make the example a lie.
  const facts = [
    [`${best.webName} · xGI per 90`, best.xgiPer90.toFixed(2)],
    [`${best.webName} · minutes risk`, best.minutesRisk],
    [`${best.team} · fixture run`, best.fixtureBand],
  ];
  // The invented figure also avoids the form points quoted in the hero answer.
  const invented = [14, 17, 23].find((n) => n !== best.formPoints) ?? 14;
  return (
    <div className="var reveal" aria-label="Example of a number check on a written preview">
      <div className="var-top">
        <span className="var-tag">VAR</span>
        <span>Checking the gameweek preview</span>
        <span className="var-rec">
          <i /> Review
        </span>
      </div>
      <div className="var-body">
        <div className="var-label">Facts our code computed</div>
        {facts.map(([k, v]) => (
          <div className="var-fact" key={k}>
            <span>{k}</span>
            <b>{v}</b>
            <span className="ok">✓</span>
          </div>
        ))}
        <div className="var-label">Draft sentence</div>
        <p className="var-draft">
          “{best.webName} has {best.xgiPer90.toFixed(2)} xGI per 90 and <mark>{invented} goals</mark> already.”
        </p>
        <div className="var-verdict">
          <span className="stamp">Disallowed</span>
          <span>
            <b>{invented}</b> is not in the facts. The draft is thrown out and the checked template version ships instead.
          </span>
        </div>
      </div>
      <span className="var-scan" aria-hidden="true" />
    </div>
  );
}

const FEATURES = [
  {
    art: <SquadArt />,
    wide: true,
    title: "Your squad, on the pitch",
    body: "Connect your team ID and your fifteen line up in their kits: captain, bench order, injury flags and every player's next fixture. Tap anyone for form, minutes risk and the fixture run ahead.",
  },
  {
    art: <TraceArt />,
    title: "It acts like a manager",
    body: "Ask it to pick your XI, rate your lineup, make a transfer or choose a captain. It makes the changes on your pitch — with every lookup shown — and you apply or revert them.",
  },
  {
    art: <WatchArt />,
    title: "Prices and injuries, watched",
    body: "Overnight price changes, players close to moving, and press-conference news, refreshed every three hours. Estimates always say so.",
  },
  {
    art: <TransferArt />,
    wide: true,
    title: "Transfers that add up",
    body: "Before a move is suggested it is checked against FPL's rules: positions, three per club, and your bank. If it does not add up, you never see it.",
  },
];

const STEPS = [
  ["1'", "Create your account", "Google, or an email and a password. About twenty seconds."],
  ["2'", "Connect your FPL team", "Paste your team ID — the number after /entry/ on your Points page. We show you the team we found so you can confirm it is yours."],
  ["3'", "Give the Gaffer a job", "Captaincy, transfers, fixtures, injuries. Every answer arrives with the numbers behind it."],
];

const FAQ: [string, string][] = [
  ["What is Armband?", "An AI manager for Fantasy Premier League — we call it the Gaffer. It shows your squad with the numbers that matter — form, expected goal involvement, minutes risk, fixture difficulty — and answers your questions about captaincy, transfers and fixtures, explaining every recommendation with figures you can check."],
  ["Is it free?", "Yes. Every account includes five questions to the Gaffer, and the squad view, player cards, fixtures and demo are unlimited."],
  ["Does it change my real FPL team?", "No — Armband only reads your team and never asks for your FPL password. When the Gaffer picks your XI, makes a transfer or changes your captain, it shows the plan on your pitch. You apply or revert it in Armband, then make the changes in the FPL app."],
  ["Do I need to give you my FPL password?", "No. We only ever need your public FPL team ID — the number in your Points page address. We read your team; we cannot make transfers or change anything."],
  ["Where does the data come from?", "From Fantasy Premier League's public data, refreshed every three hours, plus Champions League fixture dates for fixture congestion. Our own pipeline computes every metric from it."],
  ["Can the Gaffer make things up?", "It is built not to. It may only use figures that came back from a lookup in that conversation, and you see every lookup on screen. If it does not have a number, it says so instead of guessing."],
  ["What does \"estimate\" mean?", "Anything about the future — fixture difficulty, goal threat, price rises and falls — is our best computed estimate, never a guarantee. We label it every time."],
  ["How are transfers checked?", "Against FPL's rules: positions must match, no more than three players from one club, and your bank cannot go negative. Selling prices are estimates, because FPL keeps half of any rise since you bought and your purchase prices are private."],
  ["Why only five questions?", "Each answer takes real computing work, and we keep Armband free. Questions that aren't about FPL are declined and never counted."],
  ["Is this the official FPL app?", "No. Armband is an independent project, not affiliated with, endorsed by or connected to the Premier League or Fantasy Premier League. It uses public data only; the club kits on the pitch belong to their clubs."],
  ["How do I delete my account?", "From Settings, at any time. Deleting your account removes your profile, your connected team and your usage history."],
];

function TodayInFpl({ daily, codes }: { daily: { payload: ReportPayload } | null; codes: Map<string, number> }) {
  const { risers, fallers, news } = overnight(daily?.payload);
  const moves = [...risers.slice(0, 4), ...fallers.slice(0, 2)];
  const flags = news.slice(0, 5);
  if (!daily || (moves.length === 0 && flags.length === 0)) return null;

  const kit = (team: string, position: string) => {
    const code = codes.get(team);
    return code ? <img src={kitImageUrl(code, position === "GKP", 66)} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span />;
  };

  return (
    <section className="block" id="today">
      <div className="wrap">
        <SectionHead
          index="04"
          label="Today in FPL"
          title={
            <>
              The overnight, <em>already read.</em>
            </>
          }
          sub={`Straight from our pipeline's report for ${daily.payload.date}. Sign in and the Gaffer reads it against your squad.`}
        />
        <div className="boards">
          <div className="board reveal">
            <div className="board-head">
              <span>Price changes</span>
              <small>confirmed</small>
            </div>
            {moves.length === 0 && <p className="board-empty">No price changes overnight.</p>}
            {moves.map((m) => (
              <div className="board-row" key={`${m.fplId}-${m.direction}`}>
                {kit(m.team, m.position)}
                <span className="who">
                  {m.webName}
                  <small>
                    {m.team} · {m.position} · {m.card.ownership.toFixed(1)}% owned
                  </small>
                </span>
                <span className={`delta ${m.direction === "rise" ? "up" : "down"}`}>
                  {m.changeM > 0 ? "▲" : "▼"} £{m.priceM.toFixed(1)}m
                </span>
              </div>
            ))}
          </div>
          <div className="board reveal">
            <div className="board-head">
              <span>Injuries and availability</span>
              <small>last 24h</small>
            </div>
            {flags.length === 0 && <p className="board-empty">No new injury news.</p>}
            {flags.map((n) => (
              <div className="board-row" key={n.fplId}>
                {kit(n.team, n.position)}
                <span className="who">
                  {n.webName}
                  <small>{n.news || `${n.team} · ${n.position}`}</small>
                </span>
                <span className={`chance ${n.status === "a" ? "a" : n.status === "d" ? "d" : "x"}`}>
                  {n.status === "a" ? "Fit" : n.status === "d" ? `${n.chanceOfPlayingNextRound ?? 50}%` : "Out"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ page --

export default async function Landing() {
  const { squad, daily, codes, flagged } = await landingData();
  const pick = squad ? captainCase(squad) : null;

  const { risers, fallers, news } = overnight(daily?.payload);
  const kitFor = (team: string, position: string) => {
    const code = codes.get(team);
    return code ? kitImageUrl(code, position === "GKP", 66) : null;
  };
  const ticker: TickerItem[] = [
    ...risers.slice(0, 6).map((m) => ({ key: `r${m.fplId}`, name: m.webName, detail: `▲ £${m.priceM.toFixed(1)}m`, tone: "up" as const, kit: kitFor(m.team, m.position) })),
    ...news.slice(0, 6).map((n) => ({
      key: `n${n.fplId}`,
      name: n.webName,
      detail: n.status === "a" ? "back to fit" : n.status === "d" ? `${n.chanceOfPlayingNextRound ?? 50}% to play` : "ruled out",
      tone: n.status === "a" ? ("up" as const) : ("warn" as const),
      kit: kitFor(n.team, n.position),
    })),
    ...fallers.slice(0, 4).map((m) => ({ key: `f${m.fplId}`, name: m.webName, detail: `▼ £${m.priceM.toFixed(1)}m`, tone: "down" as const, kit: kitFor(m.team, m.position) })),
  ];
  // A quiet night: show who is flagged right now instead of an empty band.
  const fitness: TickerItem[] = flagged.map((f) => ({
    key: `x${f.fpl_id}`,
    name: f.webName,
    detail: f.status === "d" ? `${f.chance ?? 50}% to play` : f.status === "s" ? "suspended" : "ruled out",
    tone: f.status === "d" ? ("warn" as const) : ("down" as const),
    kit: kitImageUrl(f.team_code, f.position === "GKP", 66),
  }));

  return (
    <>
      <section className="hero">
        <div className="floodlights" aria-hidden="true">
          <i className="beam left" />
          <i className="beam right" />
        </div>
        <svg className="hero-chalk" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M600 -10 V710" pathLength={1} />
          <circle cx="600" cy="350" r="150" pathLength={1} />
          <circle cx="600" cy="350" r="4" pathLength={1} />
          <path d="M1210 170 H1010 V530 H1210" pathLength={1} />
          <path d="M-10 170 H190 V530 H-10" pathLength={1} />
        </svg>

        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="kicker">
              <b>FPL</b>Meet the Gaffer
            </span>
            <h1 className="hero-title">
              <span className="line"><span>Your FPL team.</span></span>
              <span className="line"><span>Scouted. Checked.</span></span>
              <span className="line flare"><span>Deadline-ready.</span></span>
            </h1>
            <p className="lede">
              Connect your team and meet the Gaffer, an AI manager that does the homework — form, minutes, fixtures and prices, read
              against your fifteen. Ask about captaincy or transfers and watch it look up every figure before it
              answers.
            </p>
            <div className="ctas">
              <Link href="/sign-up" className="btn btn-accent">
                Start free <Arrow />
              </Link>
              <Link href="/demo" className="btn">
                Try the demo
              </Link>
            </div>
            <ul className="hero-facts">
              <li>No FPL password</li>
              <li>Refreshed every 3 hours</li>
              <li>Free in early access</li>
            </ul>
          </div>

          {squad && (
            <>
              <div className="hero-pitch">
                <ScoreBug squad={squad} />
                <FplPitch squad={squad} value="fixture" {...(pick ? { highlight: pick.best.fplId } : {})} />
              </div>
              <div className="hero-chat">
                <Analysis squad={squad} />
              </div>
            </>
          )}
        </div>
      </section>

      {ticker.length > 0 ? <Ticker label="FPL today" items={ticker} /> : <Ticker label="Fitness watch" items={fitness} />}

      <section className="block" id="features">
        <div className="wrap">
          <SectionHead
            index="01"
            label="What it does"
            title={
              <>
                Every decision <em>gets a reason.</em>
              </>
            }
            sub="No hunches dressed up as advice. The Gaffer looks things up, checks the rules, and shows you how it got there."
          />
          <div className="features">
            {FEATURES.map((f, i) => (
              <article className={`feature reveal${f.wide ? " wide" : ""}`} key={f.title}>
                <div className="feature-art">{f.art}</div>
                <div className="feature-text">
                  <span className="feature-n">0{i + 1}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block" id="how">
        <div className="wrap">
          <SectionHead
            index="02"
            label="How it works"
            title={
              <>
                Kick-off in <em>three minutes.</em>
              </>
            }
            sub="No spreadsheets, no ten open tabs."
          />
          <ol className="timeline reveal">
            {STEPS.map(([minute, title, body]) => (
              <li key={title}>
                <span className="minute">{minute}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
          <div className="ctas center">
            <Link href="/sign-up" className="btn btn-accent">
              Create free account <Arrow />
            </Link>
          </div>
        </div>
      </section>

      <section className="block" id="trust">
        <div className="wrap split">
          <div>
            <SectionHead
              index="03"
              label="Trust, built in"
              title={
                <>
                  Every number <em>goes to VAR.</em>
                </>
              }
            />
            <ul className="checks reveal">
              <li>
                <b>Every figure is looked up.</b> Form, xGI, prices and fixtures come from our pipeline, and you see each
                lookup.
              </li>
              <li>
                <b>Rules are checked by code.</b> A transfer is only suggested after it passes FPL&apos;s rules and your
                budget.
              </li>
              <li>
                <b>Estimates say so.</b> Anything about the future is labelled — never sold as certain.
              </li>
              <li>
                <b>Invented numbers are disallowed.</b> Written previews are checked before publishing; a sentence with a
                number we did not compute never goes out.
              </li>
            </ul>
          </div>
          {squad && <VarCheck squad={squad} />}
        </div>
      </section>

      <TodayInFpl daily={daily} codes={codes} />

      <section className="block" id="faq">
        <div className="wrap split faq">
          <div>
            <SectionHead index="05" label="FAQ" title={<>Questions, <em>answered.</em></>} sub="The short version of how Armband works." />
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="text-link">
              Ask us on Telegram <Arrow />
            </a>
          </div>
          <div className="faq-list">
            {FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>
                  <span className="qn">Q{String(i + 1).padStart(2, "0")}</span>
                  {q}
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="final">
        <svg className="final-chalk" viewBox="0 0 600 300" aria-hidden="true">
          <circle cx="300" cy="300" r="120" />
          <path d="M0 300 H600" />
        </svg>
        <div className="wrap">
          <h2 className="display huge reveal">
            The deadline <em>won&apos;t wait.</em>
          </h2>
          <p className="sub">Connect your team in under a minute and ask your first question before it locks.</p>
          <div className="ctas center">
            <Link href="/sign-up" className="btn btn-accent">
              Start free <Arrow />
            </Link>
            <Link href="/demo" className="btn">
              Try the demo
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
