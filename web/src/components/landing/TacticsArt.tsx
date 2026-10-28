/**
 * Feature illustrations, drawn like a coach's tactics board: chalk lines,
 * magnets for players, dashed runs. Our own artwork. A turbulence filter
 * roughens the strokes so they read as chalk rather than vector lines.
 */
function Board({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <svg className="tactics" viewBox="0 0 400 250" role="img" aria-label={label}>
      <defs>
        <filter id={`chalk-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" />
        </filter>
      </defs>
      <g filter={`url(#chalk-${id})`}>{children}</g>
    </svg>
  );
}

function Magnet({ x, y, tone = "chalk", label }: { x: number; y: number; tone?: "chalk" | "flare" | "up" | "down"; label?: string }) {
  return (
    <g className={`magnet ${tone}`}>
      <circle cx={x} cy={y + 2.5} r="11" className="magnet-shadow" />
      <circle cx={x} cy={y} r="11" className="face" />
      {label && (
        <text x={x} y={y + 4.5} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

function Tick({ x, y }: { x: number; y: number }) {
  return <path className="tick-mark" d={`M${x - 6} ${y} l4.5 4.5 l8 -9`} />;
}

/** Your squad laid out on the board, the captain in flare, runs drawn on. */
export function SquadArt() {
  const xi: [number, number][] = [
    [46, 125],
    [104, 58], [104, 103], [104, 147], [104, 192],
    [176, 50], [176, 100], [176, 150], [176, 200],
    [256, 155],
  ];
  return (
    <Board id="squad" label="A squad laid out on a tactics board, captain highlighted">
      <g className="chalk faint">
        <rect x="18" y="18" width="364" height="214" rx="3" />
        <line x1="200" y1="18" x2="200" y2="232" />
        <circle cx="200" cy="125" r="32" />
        <rect x="18" y="72" width="44" height="106" />
        <rect x="338" y="72" width="44" height="106" />
      </g>
      <path className="chalk run" d="M176 150 Q240 205 318 182" />
      <path className="chalk run" d="M256 92 Q300 70 336 104" />
      <path className="chalk head" d="M308 174 l10 8 l-12 4" />
      <path className="chalk head" d="M326 98 l10 6 l-11 5" />
      {xi.map(([x, y]) => (
        <Magnet key={`${x}-${y}`} x={x} y={y} />
      ))}
      <Magnet x={256} y={92} tone="flare" label="C" />
    </Board>
  );
}

/** The co-pilot's working: one question, three lookups ticked, one answer. */
export function TraceArt() {
  const steps = [
    ["SQUAD", 52],
    ["FORM", 112],
    ["FIXTURES", 172],
  ] as const;
  return (
    <Board id="trace" label="A question branching into three ticked lookups, then one answer">
      <circle className="chalk" cx="56" cy="125" r="26" />
      <text className="board-text big" x="56" y="135" textAnchor="middle">?</text>
      {steps.map(([label, y], i) => (
        <g key={label} className="step" style={{ animationDelay: `${i * 0.35}s` }}>
          <path className="chalk faint" d={`M82 125 C110 125 112 ${y + 18} 140 ${y + 18}`} />
          <rect className="chalk" x="140" y={y} width="130" height="36" rx="4" />
          <text className="board-text" x="154" y={y + 24}>{label}</text>
          <Tick x={252} y={y + 18} />
          <path className="chalk faint" d={`M270 ${y + 18} C298 ${y + 18} 300 125 326 125`} />
        </g>
      ))}
      <Magnet x={342} y={125} tone="flare" label="A" />
    </Board>
  );
}

/** Price watch: a price stepping up, the projection dashed and labelled. */
export function WatchArt() {
  return (
    <Board id="watch" label="A price line stepping up with a dashed estimate, and a doubtful player flagged">
      <path className="chalk faint" d="M40 30 V200 H370" />
      <text className="board-text small" x="46" y="44">£M</text>
      <path className="chalk draw" pathLength={1} d="M44 170 H110 V138 H190 V108 H250" />
      <path className="chalk run" d="M250 108 H300 V78 H350" />
      <circle className="dot-flare" cx="250" cy="108" r="6" />
      <text className="board-text small" x="296" y="68">EST.</text>
      <text className="board-text up" x="196" y="96">▲ 0.1</text>
      <g className="flagged">
        <Magnet x={110} y={220} tone="down" label="!" />
        <text className="board-text warn" x="130" y="227">75% · KNOCK</text>
      </g>
    </Board>
  );
}

/** A transfer that adds up: one out, one in, the rules ticked. */
export function TransferArt() {
  return (
    <Board id="transfer" label="One player out, one in, with position, club and bank rules ticked">
      <Magnet x={84} y={84} tone="down" label="✕" />
      <text className="board-text small" x="70" y="122">OUT</text>
      <Magnet x={316} y={84} tone="up" label="+" />
      <text className="board-text small" x="306" y="122">IN</text>
      <path className="chalk run" d="M104 76 Q200 20 294 76" />
      <path className="chalk head" d="M283 66 l12 10 l-15 3" />
      {[
        ["POSITION", 162],
        ["MAX 3 PER CLUB", 190],
        ["BANK £0.8M", 218],
      ].map(([label, y]) => (
        <g key={label}>
          <Tick x={130} y={(y as number) - 5} />
          <text className="board-text" x="148" y={y}>{label}</text>
        </g>
      ))}
    </Board>
  );
}
