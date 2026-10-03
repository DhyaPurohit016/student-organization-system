import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import StatCard from '../../components/StatCard';
import { date, eventWhen } from '../../utils/format';
import { COLLEGE_STATUS, ROLE_LABEL, TASK_STATUS, activeClubs, isStaffAnywhere } from '../../utils/roles';

// Home for students, volunteers and guests. Platform Admins and College Heads have their own dashboards.
export default function MemberDashboard() {
  const { user, ctx } = useAuth();
  const [tickets, setTickets] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [guestClubs, setGuestClubs] = useState(null);
  const [guestEventsLoaded, setGuestEventsLoaded] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [news, setNews] = useState([]);
  const [helping, setHelping] = useState(null);
  const staff = isStaffAnywhere(ctx);

  useEffect(() => {
    if (!ctx || ctx.isPlatformAdmin) return;
    api.get('/me/tickets').then((r) => setTickets(r.data.tickets.filter((t) => t.upcoming))).catch(() => setTickets([]));
    if (ctx.collegeStatus === 'NONE') {
      api.get('/clubs')
        .then((response) => setGuestClubs(response.data.clubs))
        .catch((err) => setDiscoveryError(errorMessage(err)));
      api.get('/events?limit=60')
        .then((response) => {
          setUpcomingEvents(response.data.events.filter((event) => event.status === 'PUBLISHED'));
          setGuestEventsLoaded(true);
        })
        .catch((err) => {
          setDiscoveryError(errorMessage(err));
          setGuestEventsLoaded(true);
        });
    } else {
      const clubIds = ctx.clubs.filter((club) => club.status === 'ACTIVE').map((club) => club.id);
      Promise.all(clubIds.map((clubId) => api.get(`/events?clubId=${clubId}&limit=60`)))
        .then((responses) => {
          const unique = new Map(responses.flatMap((response) => response.data.events).map((event) => [event.id, event]));
          setUpcomingEvents([...unique.values()].filter((event) => event.status === 'PUBLISHED'));
        })
        .catch(() => setUpcomingEvents([]));
    }
    api.get('/announcements/feed').then((r) => setNews(r.data.announcements.slice(0, 4))).catch(() => {});
    if (staff) {
      Promise.all([api.get('/me/volunteering'), api.get('/me/tasks'), api.get('/me/claims')])
        .then(([v, t, c]) =>
          setHelping({
            events: v.data.assignments.filter((a) => new Date(a.event.endsAt || a.event.startsAt) >= new Date()),
            tasks: t.data.tasks.filter((x) => x.status !== 'DONE'),
            pendingExpenses: c.data.claims.filter((x) => ['SUBMITTED', 'APPROVED'].includes(x.status)).length,
          })
        )
        .catch(() => {});
    }
  }, [ctx, staff]);

  if (!ctx) return <p className="muted">Loading…</p>;
  if (ctx.isPlatformAdmin) return <Navigate to="/platform" replace />;
  if (ctx.headOf.length && !activeClubs(ctx).length) return <Navigate to={`/college/${ctx.headOf[0].id}`} replace />;

  const clubs = activeClubs(ctx);
  const myClubIds = new Set(clubs.map((club) => club.id));
  const isGuest = ctx.collegeStatus === 'NONE';
  const eventsInMyClubs = upcomingEvents
    .filter((event) => isGuest
      ? new Date(event.endsAt || event.startsAt).getTime() >= Date.now()
      : myClubIds.has(event.clubId) && new Date(event.startsAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const pending = ctx.clubs.filter((c) => c.status === 'PENDING');
  const cs = COLLEGE_STATUS[ctx.collegeStatus];

  return (
    <>
      <div className="page-head">
        <h1>Welcome, {user.name.split(' ')[0]} 👋</h1>
        <p className="muted">
          {ctx.college ? ctx.college.name : 'Guest'} · <span className={`badge tone-${cs.tone}`}>{cs.label}</span>
        </p>
      </div>

      {ctx.collegeStatus === 'PENDING' && (
        <div className="alert alert-warn">Your college still has to approve you. Until then you can join clubs and attend public events, but not college-only events.</div>
      )}
      {ctx.collegeStatus === 'NONE' && (
        <div className="alert alert-info">
          You're signed up as a guest. Studying somewhere on the platform? <Link to="/profile">Choose your college</Link> to get student prices and college events.
        </div>
      )}
      {ctx.headOf.length > 0 && (
        <div className="card todo-card">
          <ul>
            {ctx.headOf.map((c) => (
              <li key={c.id}>
                <Link to={`/college/${c.id}`}>College Head dashboard · {c.name} →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="member-upcoming section-gap">
        <div className="row-between">
          <div>
            <h2 className="section-title">{isGuest ? 'Public events to explore' : 'Upcoming in your clubs'}</h2>
            <p className="muted small">
              {isGuest
                ? 'Upcoming and happening-now public events from clubs across the platform.'
                : 'Events from clubs you have joined. Open an event to see details and your registration options.'}
            </p>
          </div>
          <Link to="/events" className="small">Browse all events →</Link>
        </div>
        {isGuest && discoveryError && <div className="alert alert-error">{discoveryError}</div>}
        {isGuest && !guestEventsLoaded && !discoveryError && <p className="muted">Loading public events…</p>}
        {eventsInMyClubs.length === 0 && (!isGuest || guestEventsLoaded) ? (
          <div className="card empty-state">
            {isGuest ? 'No public events are available right now.' : 'No upcoming club events right now.'} <Link to="/clubs">Discover a club</Link>
          </div>
        ) : eventsInMyClubs.length > 0 && (
          <div className="event-grid">
            {eventsInMyClubs.slice(0, 6).map((event) => (
              <Link key={event.id} to={`/events/${event.id}`} className="card member-event-card">
                <span className="badge tone-info">{event.club?.name || 'Club event'}</span>
                <h3>{event.title}</h3>
                <p className="muted small">{eventWhen(event)}</p>
                <span className="small">{event.memberPrice === 0 ? 'Free member enrolment' : 'View event and tickets'} →</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {isGuest && (
        <section className="section-gap">
          <div className="row-between">
            <div>
              <h2 className="section-title">Clubs to discover</h2>
              <p className="muted small">Browse clubs from every active college and open a club to see its details and events.</p>
            </div>
            <Link to="/clubs" className="small">Browse all clubs →</Link>
          </div>
          {!guestClubs && !discoveryError && <p className="muted">Loading clubs…</p>}
          {guestClubs?.length === 0 && <div className="card empty-state">No clubs are available right now.</div>}
          <div className="club-grid">
            {guestClubs?.slice(0, 6).map((club) => (
              <Link key={club.id} to={`/clubs/${club.id}`} className="card club-card">
                {club.logoUrl ? <img src={club.logoUrl} alt="" className="club-logo" /> : <span className="club-logo placeholder">{club.name[0]}</span>}
                <div>
                  <h3>{club.name}</h3>
                  <div className="muted small">{club.college.name} · {club.members} member{club.members === 1 ? '' : 's'}</div>
                  {club.description && <p className="small clamp-2">{club.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="stat-grid">
        {staff ? (
          <>
            <StatCard label="My Events" value={helping?.events.length} to="/volunteering" />
            <StatCard label="My Tasks" value={helping?.tasks.length} to="/tasks" />
            <StatCard label="Pending Expenses" value={helping?.pendingExpenses} to="/expenses" />
          </>
        ) : (
          <StatCard label="Upcoming in My Clubs" value={eventsInMyClubs.length} to="/events" />
        )}
        <StatCard label="Ticket register" value={tickets?.length} to="/tickets" />
      </div>

      <div className="grid-2 section-gap">
        {staff && (
          <section className="card">
            <div className="row-between">
              <h3>My Tasks</h3>
              <Link to="/tasks" className="small">
                All tasks →
              </Link>
            </div>
            {!helping && <p className="muted">Loading…</p>}
            {helping?.tasks.length === 0 && <p className="muted">Nothing to do right now. 🎉</p>}
            <ul className="plain-list">
              {helping?.tasks.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <strong>{t.title}</strong> <Badge status={t.status}>{TASK_STATUS[t.status].label}</Badge>
                  <div className="muted small">
                    {t.event?.title || t.fundraiser?.title || t.club?.name}
                    {t.dueDate && ` · due ${date(t.dueDate)}`}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card">
          <div className="row-between">
            <h3>Ticket register</h3>
            <Link to="/tickets" className="small">
              All →
            </Link>
          </div>
          {tickets?.length === 0 ? (
            <p className="muted">
              None yet. <Link to="/events">See what's on</Link>
            </p>
          ) : (
            <ul className="plain-list">
              {tickets?.slice(0, 4).map((t) => (
                <li key={t.id}>
                  <Link to="/tickets">
                    <strong>{t.event.title}</strong>
                  </Link>
                  <div className="muted small">
                    {eventWhen(t.event)} · {t.event.club?.name}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="row-between">
            <h3>My Membership</h3>
            <div className="row-actions">
              <Link to="/clubs" className="small">Discover clubs →</Link>
              <Link to="/membership" className="small">Membership cards →</Link>
            </div>
          </div>
          {clubs.length === 0 && pending.length === 0 && (
            <p className="muted">
              You haven't joined any clubs yet. <Link to="/clubs">Find one</Link>
            </p>
          )}
          <div className="member-club-grid">
            {clubs.map((c) => (
              <article key={c.id} className="member-club-card">
                <Link to={`/clubs/${c.id}`} className="member-club-main">
                  <strong>{c.name}</strong>
                  <span className="muted small">{c.college.name}</span>
                </Link>
                <div className="row-between member-club-foot">
                  <span className={`role-badge role-${c.role.toLowerCase()}`}>{ROLE_LABEL[c.role]}</span>
                  {c.duesRequired && <Badge status="EXPIRED">Dues</Badge>}
                  <Link to={`/clubs/${c.id}/shop`} className="small">Shop →</Link>
                </div>
              </article>
            ))}
          </div>
          {pending.length > 0 && (
            <ul className="plain-list member-pending-list">
              {pending.map((c) => (
                <li key={c.id} className="row-between">
                  <Link to={`/clubs/${c.id}`}>{c.name}</Link>
                  <Badge status="PENDING">Request sent</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="row-between">
            <h3>Announcements</h3>
            <Link to="/announcements" className="small">
              All →
            </Link>
          </div>
          {news.length === 0 && <p className="muted">No announcements yet.</p>}
          <ul className="plain-list">
            {news.map((a) => (
              <li key={a.id}>
                <Link to={`/announcements#a${a.id}`}>
                  <strong>{a.title}</strong>
                </Link>
                <div className="muted small">
                  {a.club?.name || a.college?.name} · {date(a.publishedAt)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
