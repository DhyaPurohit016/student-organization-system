import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { EventCard } from './Home';

// Public events from every college, plus private ones you're allowed into.
// scope="college": only my college's events (the "College events" menu item for students).
export default function Events({ scope }) {
  const { user, ctx } = useAuth();
  const myCollege = scope === "college" ? ctx?.college : null;
  const [params, setParams] = useSearchParams();
  const when = params.get('when') || 'upcoming';
  const collegeId = myCollege ? String(myCollege.id) : params.get('collegeId') || '';
  const [colleges, setColleges] = useState([]);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/colleges').then((r) => setColleges(r.data.colleges)).catch(() => {});
  }, []);
  useEffect(() => {
    setEvents(null);
    const q = new URLSearchParams({ when });
    if (collegeId) q.set('collegeId', collegeId);
    api
      .get(`/events?${q}`)
      .then((r) => setEvents(r.data.events))
      .catch((err) => setError(errorMessage(err)));
  }, [when, collegeId]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>{myCollege ? `${myCollege.code} events` : "Events"}</h1>
          <p className="muted">{myCollege ? `Everything happening at ${myCollege.name}: public and college-only events from all its clubs.` : user ? 'Public events from every college, plus college-only and club-only events you can attend.' : 'Public events from every college. Log in to see events for your college and clubs.'}</p>
        </div>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={when === 'upcoming'} className={when === 'upcoming' ? 'on' : ''} onClick={() => setParam('when', '')}>
            Upcoming
          </button>
          <button role="tab" aria-selected={when === 'past'} className={when === 'past' ? 'on' : ''} onClick={() => setParam('when', 'past')}>
            Past
          </button>
        </div>
      </div>
      {!myCollege && (
      <div className="toolbar">
        <select value={collegeId} onChange={(e) => setParam('collegeId', e.target.value)} aria-label="College">
          <option value="">All colleges</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {!events && <p className="muted">Loading…</p>}
      {events?.length === 0 && <div className="card empty-state">No {when} events.</div>}
      <div className="event-grid">
        {events?.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    </>
  );
}
