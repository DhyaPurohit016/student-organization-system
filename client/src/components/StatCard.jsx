import { Link } from 'react-router-dom';

// A dashboard number tile. `value` of null shows the phase that will fill it in.
// Pass `to` to make the tile a link (e.g. to a filtered list).
export default function StatCard({ label, value, phase, money, to }) {
  const pending = value === null || value === undefined;
  const display = pending ? '—' : money ? `₹${Number(value).toLocaleString('en-IN')}` : value;

  const body = (
    <>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{display}</div>
      {pending && phase && <div className="stat-note">Available in Phase {phase}</div>}
    </>
  );

  if (to && !pending) {
    return (
      <Link to={to} className="stat-card stat-link">
        {body}
      </Link>
    );
  }
  return <div className={`stat-card ${pending ? 'pending' : ''}`}>{body}</div>;
}
