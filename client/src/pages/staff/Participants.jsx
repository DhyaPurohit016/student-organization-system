import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import Badge from '../../components/Badge';
import { eventWhen, time } from '../../utils/format';
import { REG_TYPE } from '../../utils/roles';

// Participants of the events I'm helping at: who's coming and who has arrived
export default function Participants() {
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState(null);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/me/volunteering')
      .then((r) => {
        const upcoming = r.data.assignments.filter((a) => a.event.status !== 'CANCELLED').map((a) => a.event);
        setEvents(upcoming);
        if (!params.get('event') && upcoming.length) setParams({ event: upcoming[0].id }, { replace: true });
      })
      .catch((err) => setError(errorMessage(err)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const eventId = params.get('event');
  useEffect(() => {
    if (!eventId) return;
    setData(null);
    api.get(`/me/volunteering/${eventId}/participants`).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err)));
  }, [eventId]);

  const q = search.trim().toLowerCase();
  const rows = data?.participants.filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) || [];
  const arrived = data?.participants.filter((p) => p.checkedInAt).length || 0;

  return (
    <>
      <div className="page-head">
        <h1>Participants</h1>
        <p className="muted">Who registered for the events you're helping at, and who has arrived.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {events?.length === 0 && <div className="card empty-state">You're not helping at any events yet.</div>}
      {events?.length > 0 && (
        <div className="toolbar">
          <select value={eventId || ''} onChange={(e) => setParams({ event: e.target.value })} aria-label="Event">
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} — {eventWhen(e)}
              </option>
            ))}
          </select>
          <input className="search" placeholder="Search name or ticket code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      {eventId && !data && !error && <p className="muted">Loading…</p>}
      {data && (
        <>
          <p className="small">
            <strong>{data.participants.length}</strong> registered · <strong>{arrived}</strong> arrived · {data.event.capacity - data.participants.length} seats left
          </p>
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Ticket</th>
                  <th>Type</th>
                  <th>Arrived</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      {data.participants.length ? 'No match.' : 'Nobody has registered yet.'}
                    </td>
                  </tr>
                )}
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.college && <span className="muted small"> · {p.college}</span>}
                    </td>
                    <td className="mono">{p.code}</td>
                    <td>{REG_TYPE[p.registrationType]}</td>
                    <td>{p.checkedInAt ? <Badge status="VALID">{time(p.checkedInAt)}</Badge> : <span className="muted">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
