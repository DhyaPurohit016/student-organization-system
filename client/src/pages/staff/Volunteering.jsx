import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import Badge from '../../components/Badge';
import { eventWhen } from '../../utils/format';

// "My Events": events I'm approved to help at, my duty, and whether I can check people in
export default function Volunteering() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/me/volunteering').then((r) => setRows(r.data.assignments)).catch((err) => setError(errorMessage(err)));
  }, []);

  if (!rows) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;
  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.event.endsAt || r.event.startsAt).getTime() > now - 6 * 3600000).reverse();
  const past = rows.filter((r) => !upcoming.includes(r));

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>My Events</h1>
          <p className="muted">Events you're helping at. Want to help at more? Offer under Helping Out.</p>
        </div>
        <Link to="/helping-out" className="btn btn-ghost">
          Helping Out →
        </Link>
      </div>
      {upcoming.length === 0 && (
        <div className="card empty-state">
          You're not helping at any upcoming events. <Link to="/helping-out">See events looking for volunteers</Link>
        </div>
      )}
      <div className="stack">
        {upcoming.map((r) => (
          <div key={r.id} className="card task-row">
            <div>
              <strong>{r.event.title}</strong>
              <div className="muted small">
                {r.event.club?.name} · {eventWhen(r.event)} · {r.event.venue}
              </div>
              <p className="small">
                Your duty: <strong>{r.duty}</strong>
                {r.canCheckIn && ' · you can check people in'}
              </p>
            </div>
            <div className="task-actions">
              {r.event.status === 'CANCELLED' ? (
                <Badge status="CANCELLED" />
              ) : (
                <>
                  <Link className="btn btn-ghost btn-sm" to={`/participants?event=${r.eventId}`}>
                    Participants
                  </Link>
                  {r.canCheckIn && (
                    <Link className="btn btn-primary btn-sm" to="/checkin">
                      Door scanner
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {past.length > 0 && (
        <details className="section-gap">
          <summary>Past events ({past.length})</summary>
          <ul className="plain-list">
            {past.map((r) => (
              <li key={r.id}>
                {r.event.title} <span className="muted small">· {r.duty} · {eventWhen(r.event)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
