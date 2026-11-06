import Link from "next/link";
import { kitImageUrl, type ReportPayload, type ReportSection, type Squad, type TeamRun } from "@fpl/shared";
import { ExploreTools, type ExploreFacts } from "@/components/landing/ExploreTools";
import { HeroShow } from "@/components/landing/HeroShow";
import { TeamIdBox } from "@/components/landing/TeamIdBox";
import { DeadlineCountdown } from "@/components/team/DeadlineCountdown";
import { deadlines, nextDeadline } from "@/lib/cards/data";
import "@/components/team/team.css";
import { Ticker, type TickerItem } from "@/components/landing/Ticker";
import { SquadArt, TraceArt, TransferArt, WatchArt } from "@/components/landing/TacticsArt";
import { DEMO_TEAM_ID, TELEGRAM_URL } from "@/components/site/links";
import { loadSquad } from "@/lib/squad";
import { readView } from "@/lib/supabase";
import { bestXi, squadCards } from "@/lib/toolkit";

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
  const [squad, reports, teams, flagged, scorers, risers, runs, ids, upcoming] = await Promise.all([
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
    // The Explore cards' live numbers. Direction only from price_change_percent (CLAUDE.md §2).
    readView<{ web_name: string; team_short_name: string; goals_scored: number }>(
      "player_current",
      "select=web_name,team_short_name,goals_scored&order=goals_scored.desc,total_points.desc&limit=1",
    ).catch(() => []),
    readView<{ web_name: string; team_short_name: string; price_change_percent: number }>(
      "price_watch",
      "select=web_name,team_short_name,price_change_percent&direction=eq.rising&order=price_change_percent.desc&limit=1",
    ).catch(() => []),
    readView<{ team_short_name: string; run: TeamRun }>("team_runs", "select=team_short_name,run").catch(() => []),
    readView<{ fpl_id: number }>("player_current", "select=fpl_id").catch(() => []),
    deadlines(),
  ]);
  const codes = new Map(teams.map((t) => [t.team_short_name, t.team_code]));
  const result = squad ? await squadCards(squad).then((cards) => bestXi(squad, cards)).catch(() => null) : null;
  const easiest = [...runs].filter((r) => r.run?.long).sort((a, b) => a.run.long.adjustedDifficulty - b.run.long.adjustedDifficulty)[0];
  const explore: ExploreFacts = {
    topScorer: scorers[0] ? { name: scorers[0].web_name, team: scorers[0].team_short_name, goals: scorers[0].goals_scored } : null,
    riser: risers[0] ? { name: risers[0].web_name, team: risers[0].team_short_name, percent: risers[0].price_change_percent } : null,
    easiest: easiest ? { team: easiest.team_short_name, band: easiest.run.long.band } : null,
    players: ids.length,
  };
  return { squad, daily: reports[0] ?? null, codes, flagged, result, explore, upcoming };
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

function SectionHead({ label, title, sub, center }: { index?: string; label: string; title: React.ReactNode; sub?: string; center?: boolean }) {
  return (
    <div className={`sec-head reveal${center ? " center" : ""}`}>
      <span className="sec-kicker">{label}</span>
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
    ["Squad", `15 players · £${squad.bankM.toFixed(1)}m in the bank${flagged ? ` · ${flagged} flagged` : ""}`],
    ["Threat", `${pick.best.webName} · ${pick.best.xgiPer90.toFixed(2)} xGI/90 · ${pick.best.minutesRisk.toLowerCase()} minutes risk`],
    ["Fixtures", `${pick.best.team} · ${pick.best.fixtureBand.toLowerCase()} run${pick.next ? ` · next ${pick.next}` : ""}`],
  ];
  return (
    <div className="analysis" aria-label="Example: the Gaffer's captain check on the demo team">
      <div className="analysis-head">
        <span className="on-air">Gaffer</span>
        <span className="q">Captain check · demo team</span>
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
    </div>
  );
}

const FEATURES = [
  {
    art: <SquadArt />,
    wide: true,
    title: "Your squad, on the pitch",
    body: "Enter your team ID and your fifteen line up in their kits: captain, bench order, injury flags and every player's next fixture. Tap anyone for form, minutes risk and the fixture run ahead.",
  },
  {
    art: <TraceArt />,
    title: "Five checks, one tap each",
    body: "Best XI, a lineup rating, captain options, legal transfers within your bank and an injury check. Each one shows the numbers behind it, puts its plan on your pitch, and you apply or revert it.",
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

const FAQ: [string, string][] = [
  ["What is Armband?", "Free, open-source tools for Fantasy Premier League, with no sign-up. Enter your team ID and see your fifteen with the numbers that matter (form, expected goal involvement, minutes risk, fixture difficulty), then pick your best XI, rate your lineup, choose a captain and find transfers that fit your bank. The Gaffer runs those checks in one tap each, all of it computed in code."],
  ["Is it free?", "Yes, and it stays free. Every tool is free with no limits and no ads. The code is open source, so anyone can check how it works or run their own copy."],
  ["Is it open source?", "Yes. All of Armband is on GitHub under the MIT license: the website, the data pipeline, the insight engine and the Gaffer. Read how every number is computed, run it yourself, or contribute."],
  ["Does it change my real FPL team?", "No — Armband only reads your team and never asks for your FPL password. When the Gaffer picks your XI, makes a transfer or changes your captain, it shows the plan on your pitch. You apply or revert it in Armband, then make the changes in the FPL app."],
  ["Do I need to give you my FPL password?", "No. We only ever need your public FPL team ID — the number in your Points page address. We read your team; we cannot make transfers or change anything."],
  ["Where does the data come from?", "From Fantasy Premier League's public data, refreshed every three hours, plus Champions League fixture dates for fixture congestion. Our own pipeline computes every metric from it."],
  ["Is there AI in it?", "Not in your squad tools. The Gaffer's five checks are plain code over FPL's data, so the same squad always gets the same answer and every number is shown. The only AI writes the pre-deadline preview on our Telegram channel, and code checks every figure in it before it goes out."],
  ["What does \"estimate\" mean?", "Anything about the future — fixture difficulty, goal threat, price rises and falls — is our best computed estimate, never a guarantee. We label it every time."],
  ["How are transfers checked?", "Against FPL's rules: positions must match, no more than three players from one club, and your bank cannot go negative. Selling prices are estimates, because FPL keeps half of any rise since you bought and your purchase prices are private."],
  ["Is this the official FPL app?", "No. Armband is an independent project, not affiliated with, endorsed by or connected to the Premier League or Fantasy Premier League. It uses public data only; the club kits on the pitch belong to their clubs."],
  ["Do I need an account?", "No. There is no sign-up. Enter your FPL team ID and your dugout opens at its own address, which you can bookmark or open on your phone. Choose \"This is my team\" and \"My team\" opens it next time. That is kept in your browser only: Armband stores nothing about you."],
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
          index="05"
          label="Today in FPL"
          title={
            <>
              The overnight, <em>already read</em>
            </>
          }
          sub={`Straight from our pipeline's report for ${daily.payload.date}. Find your team and the injury check reads it against your fifteen.`}
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
  const { squad, daily, codes, flagged, result, explore, upcoming } = await landingData();

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
              <b>Free</b>
              <span>No sign-up · {nextDeadline(upcoming, new Date()) ? <DeadlineCountdown deadlines={upcoming} /> : "refreshed every 3 hours"}</span>
            </span>
            <h1 className="hero-title">
              <span className="line"><span>Your FPL team,</span></span>
              <span className="line"><span>scouted and checked,</span></span>
              <span className="line flare"><span>deadline-ready</span></span>
            </h1>
            <p className="lede">
              Armband reads your fifteen against form, minutes, fixtures and prices, then picks your best XI, rates your
              lineup and finds transfers that fit your bank. Every number computed, every working shown.
            </p>
            <TeamIdBox id="hero-team" />
          </div>

          {result && (
            <div className="hero-pitch">
              <HeroShow result={result} />
            </div>
          )}
        </div>
      </section>

      {ticker.length > 0 ? <Ticker label="FPL today" items={ticker} /> : <Ticker label="Fitness watch" items={fitness} />}

      <section className="block" id="explore">
        <div className="wrap">
          <SectionHead
            index="01"
            label="Free tools"
            title={
              <>
                Everything before the deadline, <em>free</em>
              </>
            }
            sub="Stats, prices, fixtures and every player, refreshed every three hours. No account needed."
          />
          <ExploreTools facts={explore} />
        </div>
      </section>

      <section className="block" id="features">
        <div className="wrap">
          <SectionHead
            index="02"
            label="What it does"
            title={
              <>
                Every decision <em>gets a reason</em>
              </>
            }
            sub="No hunches dressed up as advice. Armband looks things up, checks the rules, and shows you how it got there."
          />
          <div className="features">
            {FEATURES.map((f) => (
              <article className={`feature reveal${f.wide ? " wide" : ""}`} key={f.title}>
                <div className="feature-art">{f.art}</div>
                <div className="feature-text">
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block" id="gaffer">
        <div className="wrap split">
          <div>
            <SectionHead
              index="03"
              label="The Gaffer"
              title={
                <>
                  Five checks that <em>show their working</em>
                </>
              }
              sub="Best XI, lineup rating, captain, transfers and injuries, computed in code from FPL's data with no limits. Each check shows its numbers and puts its plan on your pitch for you to apply or revert."
            />
            <Link href={`/team/${DEMO_TEAM_ID}`} className="text-link">
              See the checks on an example team <Arrow />
            </Link>
          </div>
          {squad && <Analysis squad={squad} />}
        </div>
      </section>

      <section className="block" id="trust">
        <div className="wrap split">
          <div>
            <SectionHead
              index="04"
              label="Trust, built in"
              title={
                <>
                  Every number <em>goes to VAR</em>
                </>
              }
            />
            <ul className="checks reveal">
              <li>
                <b>Code computes, never the model.</b> Form, xGI, prices and fixtures come from our pipeline and tested
                functions.
              </li>
              <li>
                <b>Rules are checked by code.</b> A transfer is only shown after it passes FPL&apos;s rules and your
                budget.
              </li>
              <li>
                <b>Estimates say so.</b> Anything about the future is labelled, never sold as certain.
              </li>
              <li>
                <b>Invented numbers are disallowed.</b> A sentence with a number we did not compute never goes out.
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
            <SectionHead index="06" label="FAQ" title={<>Questions, <em>answered</em></>} sub="The short version of how Armband works." />
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
            The deadline <em>won&apos;t wait</em>
          </h2>
          <p className="sub">Your team ID is all it takes. No sign-up, free, open source, and every number shown.</p>
          <TeamIdBox id="final-team" center />
        </div>
      </section>
    </>
  );
}
