// The hero picture: a small version of the pacing view, drawn with sample data.
// Server-rendered SVG; one CSS sequence draws the spend line, extends the
// forecast and then flags the overspend (skipped with reduced motion).

const BUDGET = 12_000;
const DAYS = 31;
const TODAY = 14;
// Cumulative spend, days 1–14.
const SPEND = [388, 790, 1161, 1616, 2063, 2475, 2895, 3331, 3732, 4184, 4652, 5097, 5527, 5990];
const FORECAST = Math.round(SPEND[TODAY - 1] + ((DAYS - TODAY) * SPEND[TODAY - 1]) / TODAY); // 13,264
const NEEDED_PER_DAY = Math.round((BUDGET - SPEND[TODAY - 1]) / (DAYS - TODAY)); // 354

const W = 560;
const H = 230;
const PAD = { l: 8, r: 8, t: 18, b: 26 };
const Y_MAX = 14_000;
const x = (day: number) => PAD.l + (day / DAYS) * (W - PAD.l - PAD.r);
const y = (v: number) => H - PAD.b - (v / Y_MAX) * (H - PAD.t - PAD.b);

const actualPath = ["M", x(0), y(0), ...SPEND.flatMap((v, i) => ["L", x(i + 1), y(v)])].join(" ");
const forecastPath = `M ${x(TODAY)} ${y(SPEND[TODAY - 1])} L ${x(DAYS)} ${y(FORECAST)}`;
const idealPath = `M ${x(0)} ${y(0)} L ${x(DAYS)} ${y(BUDGET)}`;

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

const CLIENTS: { name: string; platforms: string; pace: number }[] = [
  { name: "Harbor Dental", platforms: "Google Ads, Meta", pace: 111 },
  { name: "Summit Heating & Air", platforms: "Google Ads, LSA", pace: 101 },
  { name: "Elm Street Law", platforms: "Google Ads, Microsoft", pace: 78 },
  { name: "Bayview Pet Clinic", platforms: "Meta", pace: 96 },
];

function status(pace: number) {
  if (pace > 105) return { tone: "over", label: `${pace - 100}% over` };
  if (pace < 90) return { tone: "under", label: `${100 - pace}% under` };
  return { tone: "ok", label: "On pace" };
}

export function PacingBoard() {
  return (
    <figure className="mn-board" aria-label="Example: budget pacing for four clients, with a month-end forecast">
      <div className="mn-board-head">
        <div>
          <p className="mn-board-client">Harbor Dental</p>
          <p className="mn-board-sub">October, day {TODAY} of {DAYS}</p>
        </div>
        <span className="mn-board-sample">Sample data</span>
      </div>

      <div className="mn-board-flag">
        <strong>Forecast {usd(FORECAST)}</strong>
        <span>{usd(FORECAST - BUDGET)} over budget by Oct 31</span>
      </div>
      <div className="mn-board-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spend so far ${usd(SPEND[TODAY - 1])}. Forecast ${usd(FORECAST)} against a ${usd(BUDGET)} budget.`}>
          <line className="mn-c-budget" x1={x(0)} x2={x(DAYS)} y1={y(BUDGET)} y2={y(BUDGET)} />
          <text className="mn-c-label" x={x(0) + 2} y={y(BUDGET) - 7}>Budget {usd(BUDGET)}</text>
          <path className="mn-c-ideal" d={idealPath} />
          <line className="mn-c-today" x1={x(TODAY)} x2={x(TODAY)} y1={PAD.t - 6} y2={H - PAD.b} />
          <text className="mn-c-axis" x={x(TODAY)} y={H - 8} textAnchor="middle">Today</text>
          <text className="mn-c-axis" x={x(0)} y={H - 8}>Oct 1</text>
          <text className="mn-c-axis" x={x(DAYS)} y={H - 8} textAnchor="end">Oct 31</text>
          <path className="mn-c-actual" d={actualPath} pathLength={1} />
          <path className="mn-c-forecast" d={forecastPath} />
          <circle className="mn-c-end" cx={x(DAYS)} cy={y(FORECAST)} r={5} />
        </svg>
      </div>

      <p className="mn-board-fix">
        Spend <strong>{usd(NEEDED_PER_DAY)} a day</strong> from here to land on budget.
      </p>

      <ul className="mn-board-rows">
        {CLIENTS.map((c) => {
          const s = status(c.pace);
          return (
            <li key={c.name} className={c.name === "Harbor Dental" ? "is-selected" : undefined}>
              <span className="mn-row-name">
                {c.name}
                <span>{c.platforms}</span>
              </span>
              <span className="mn-row-bar" aria-hidden>
                <span className={`mn-row-fill tone-${s.tone}`} style={{ width: `${Math.min(c.pace, 125) / 1.25}%` }} />
                <span className="mn-row-tick" />
              </span>
              <span className={`mn-row-status tone-${s.tone}`}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
