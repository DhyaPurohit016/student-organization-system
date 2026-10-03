import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import StatCard from '../../components/StatCard';
import { date, eventWhen } from '../../utils/format';
import { COLLEGE_STATUS, ROLE_LABEL, TASK_STATUS, activeClubs, isStaffAnywhere } from '../../utils/roles';

// Home for students, volunteers and guests. Platform Admins and College Heads have their own dashboards.
export default function MemberDashboard() {
  const { user, ctx } = useAuth();
  const [tickets, setTickets] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [news, setNews] = useState([]);
  const [helping, setHelping] = useState(null);
  const staff = isStaffAnywhere(ctx);

  useEffect(() => {
    if (!ctx || ctx.isPlatformAdmin) return;
    api.get('/me/tickets').then((r) => setTickets(r.data.tickets.filter((t) => t.upcoming))).catch(() => setTickets([]));
    api.get('/events').then((r) => setUpcoming(r.data.events.filter((e) => e.status === 'PUBLISHED').length)).catch(() => {});
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

      <div className="stat-grid">
        {staff ? (
          <>
            <StatCard label="My Events" value={helping?.events.length} to="/volunteering" />
            <StatCard label="My Tasks" value={helping?.tasks.length} to="/tasks" />
            <StatCard label="Pending Expenses" value={helping?.pendingExpenses} to="/expenses" />
          </>
        ) : (
          <StatCard label="Upcoming Events" value={upcoming} to="/events" />
        )}
        <StatCard label="My Registrations" value={tickets?.length} to="/tickets" />
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
            <h3>My Registrations</h3>
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
            <Link to="/membership" className="small">
              Cards & dues →
            </Link>
          </div>
          {clubs.length === 0 && pending.length === 0 && (
            <p className="muted">
              You haven't joined any clubs yet. <Link to="/clubs">Find one</Link>
            </p>
          )}
          <ul className="plain-list">
            {clubs.map((c) => (
              <li key={c.id} className="row-between">
                <span>
                  <Link to={`/clubs/${c.id}`}>
                    <strong>{c.name}</strong>
                  </Link>
                  <span className="muted small"> · {c.college.code}</span>
                </span>
                <span className="row-actions">
                  <span className={`role-badge role-${c.role.toLowerCase()}`}>{ROLE_LABEL[c.role]}</span>
                  {c.duesRequired && <Badge status="EXPIRED">Dues</Badge>}
                </span>
              </li>
            ))}
            {pending.map((c) => (
              <li key={c.id} className="row-between">
                <Link to={`/clubs/${c.id}`}>{c.name}</Link>
                <Badge status="PENDING">Request sent</Badge>
              </li>
            ))}
          </ul>
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
