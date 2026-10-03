import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import { date, eventWhen, money } from '../../utils/format';
import { VISIBILITY } from '../../utils/roles';

export default function Home() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [news, setNews] = useState([]);

  useEffect(() => {
    api.get('/events?limit=6').then((r) => setEvents(r.data.events.filter((e) => e.status === 'PUBLISHED').slice(0, 6))).catch(() => {});
    api.get('/clubs').then((r) => setClubs(r.data.clubs.slice(0, 8))).catch(() => {});
    api.get('/colleges').then((r) => setColleges(r.data.colleges)).catch(() => {});
    api.get('/announcements?limit=4').then((r) => setNews(r.data.announcements)).catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Every club. Every college. One place.</h1>
        <p>Join clubs, register for events across colleges, buy club merch and never miss an announcement.</p>
        <div className="row-actions center-row">
          {!user && (
            <Link className="btn btn-primary" to="/register">
              Create your account
            </Link>
          )}
          <Link className="btn btn-ghost" to="/events">
            Browse events
          </Link>
          <Link className="btn btn-ghost" to="/clubs">
            Explore clubs
          </Link>
        </div>
      </section>

      <section className="home-section">
        <div className="row-between">
          <h2>Upcoming public events</h2>
          <Link to="/events">All events →</Link>
        </div>
        {events.length === 0 ? <p className="muted">No events announced yet.</p> : <div className="event-grid">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>}
      </section>

      <section className="home-section">
        <div className="row-between">
          <h2>Clubs</h2>
          <Link to="/clubs">All clubs →</Link>
        </div>
        <div className="club-grid compact">
          {clubs.map((c) => (
            <Link key={c.id} to={`/clubs/${c.id}`} className="card club-card">
              {c.logoUrl ? <img src={c.logoUrl} alt="" className="club-logo" /> : <span className="club-logo placeholder">{c.name[0]}</span>}
              <div>
                <strong>{c.name}</strong>
                <div className="muted small">{c.college.code}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid-2 home-section">
        <section>
          <h2>Colleges on the platform</h2>
          <ul className="plain-list">
            {colleges.map((c) => (
              <li key={c.id}>
                <Link to={`/clubs?collegeId=${c.id}`}>
                  <strong>{c.name}</strong>
                </Link>
                <span className="muted small"> · {c.city || c.code}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>Latest news</h2>
          {news.length === 0 && <p className="muted">No announcements yet.</p>}
          {news.map((a) => (
            <article key={a.id} className="card news-card">
              <div className="muted small">
                {a.club?.name || a.college?.name} · {date(a.publishedAt)}
              </div>
              <h3>{a.title}</h3>
              <p className="clamp-3">{a.body}</p>
              <Link to={`/news#a${a.id}`} className="small">
                Read more →
              </Link>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

export function EventCard({ event }) {
  const lowest = Math.min(event.guestPrice, event.collegePrice ?? event.guestPrice, event.memberPrice ?? event.guestPrice);
  return (
    <Link to={`/events/${event.id}`} className="card event-card">
      {event.imageUrl ? <img src={event.imageUrl} alt="" className="event-img" /> : <div className="event-img placeholder">{event.title[0]}</div>}
      <div className="event-body">
        <div className="muted small">{eventWhen(event)}</div>
        <h3>{event.title}</h3>
        <div className="muted small">
          {event.club?.name}
          {event.club?.college && ` · ${event.club.college.code}`} · {event.venue}
        </div>
        <div className="event-foot">
          <span>{event.guestPrice === 0 && !event.memberPrice ? 'Free' : `From ${money(lowest)}`}</span>
          <span className="row-actions">
            {event.visibility !== 'PUBLIC' && <Badge status={event.visibility}>{VISIBILITY[event.visibility].label}</Badge>}
            {event.status === 'CANCELLED' ? (
              <span className="badge tone-bad">Cancelled</span>
            ) : event.seatsLeft === 0 ? (
              <span className="badge tone-bad">Full</span>
            ) : !event.salesOpen ? (
              <span className="badge tone-neutral">Closed</span>
            ) : event.seatsLeft <= 10 ? (
              <span className="badge tone-warn">{event.seatsLeft} left</span>
            ) : null}
          </span>
        </div>
      </div>
    </Link>
  );
}
