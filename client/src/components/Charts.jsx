import { useState } from 'react';
import { money } from '../utils/format';

const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

function niceMax(v) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
}

// Money in vs out per month: grouped bars, one shared axis, legend, hover tooltip, table view
export function IncomeExpenseChart({ data }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  if (!data?.length) return <p className="muted small">No money recorded yet.</p>;

  const W = 640;
  const H = 240;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.expense))));
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const group = plotW / data.length;
  const barW = Math.min(28, (group - 14) / 2);
  const y = (v) => pad.t + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  // Bar with 4px rounded top, square bottom on the baseline
  const bar = (x, v) => {
    const top = y(v);
    const h = pad.t + plotH - top;
    if (h <= 0) return '';
    const r = Math.min(4, h, barW / 2);
    return `M${x},${pad.t + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.t + plotH} Z`;
  };

  return (
    <div className="viz">
      <div className="viz-head">
        <div className="viz-legend">
          <span>
            <i className="swatch s-income" /> Money in
          </span>
          <span>
            <i className="swatch s-expense" /> Money out
          </span>
        </div>
        <button className="link-btn small" onClick={() => setTable(!table)}>
          {table ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {table ? (
        <table className="table compact">
          <thead>
            <tr>
              <th>Month</th>
              <th className="right">In</th>
              <th className="right">Out</th>
              <th className="right">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{monthLabel(d.month)}</td>
                <td className="right">{money(d.income)}</td>
                <td className="right">{money(d.expense)}</td>
                <td className="right">{money(d.income - d.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="viz-plot">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly money in and out">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
                <text x={pad.l - 8} y={y(t) + 4} className="axis" textAnchor="end">
                  {t >= 1000 ? `₹${Math.round(t / 1000)}k` : `₹${Math.round(t)}`}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = pad.l + i * group + (group - barW * 2 - 2) / 2;
              return (
                <g key={d.month}>
                  <path d={bar(x0, d.income)} className="m-income" />
                  <path d={bar(x0 + barW + 2, d.expense)} className="m-expense" />
                  <text x={pad.l + i * group + group / 2} y={H - 8} className="axis" textAnchor="middle">
                    {monthLabel(d.month)}
                  </text>
                  {/* Hit target: the whole month column */}
                  <rect
                    x={pad.l + i * group}
                    y={pad.t}
                    width={group}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="viz-tip" style={{ left: `${((pad.l + hover * group + group / 2) / W) * 100}%` }}>
              <strong>{monthLabel(data[hover].month)}</strong>
              <span>
                <i className="swatch s-income" /> In {money(data[hover].income)}
              </span>
              <span>
                <i className="swatch s-expense" /> Out {money(data[hover].expense)}
              </span>
              <span className="muted">Net {money(data[hover].income - data[hover].expense)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Single-series horizontal bars with direct value labels (e.g. income by category)
export function CategoryBars({ rows, labelFor = (r) => r.label, tone = 'income' }) {
  if (!rows?.length) return <p className="muted small">Nothing recorded for this period.</p>;
  const max = Math.max(...rows.map((r) => r.total));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={labelFor(r)} title={`${labelFor(r)}: ${money(r.total)}`}>
          <span className="hbar-label">{labelFor(r)}</span>
          <span className="hbar-track">
            <span className={`hbar m-${tone}`} style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }} />
          </span>
          <span className="hbar-value">{money(r.total)}</span>
        </li>
      ))}
    </ul>
  );
}

// Thin progress meter (tasks done, money raised, seats sold)
export function Meter({ value, max, tone = 'income', label }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className={`meter-fill m-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
