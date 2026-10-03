import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import { EventCard } from './Home';
import { benefitList, date, dateTime, durationLabel, money } from '../../utils/format';
import MembershipCard from '../../components/MembershipCard';

// A club's public page. Logged in: join / request status / member card / dues.
export default function ClubPage() {
  const { clubId } = useParams();
  const { user, refreshContext } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api.get(`/clubs/${clubId}`).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err)));
    api.get(`/events?clubId=${clubId}`).then((r) => setEvents(r.data.events)).catch(() => {});
  }, [clubId]);
  useEffect(load, [load]);

  const act = async (key, fn, text) => {
    setBusy(key);
    setMsg({ type: '', text: '' });
    try {
      const r = await fn();
      setMsg({ type: 'success', text: typeof text === 'function' ? text(r.data) : text });
      load();
      refreshContext();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy('');
    }
  };

  const payDues = async (planId) => {
    setBusy(`plan-${planId}`);
    try {
      const r = await api.post(`/clubs/${clubId}/dues/checkout`, { planId });
      navigate(`/checkout/${r.data.payment.id}`);
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
      setBusy('');
    }
  };

  if (!data) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;
  const { club, me, plans, news, members, managers } = data;
  const showPlans = me?.status === 'ACTIVE' && plans.length > 0 && (me.duesRequired || plans.length);

  return (
    <div className="club-page">
      <div className="club-hero card">
        {club.logoUrl ? <img src={club.logoUrl} alt="" className="club-logo big" /> : <span className="club-logo placeholder big">{club.name[0]}</span>}
        <div className="club-hero-main">
          <h1>{club.name}</h1>
          <p className="muted">
            <Link to={`/clubs?collegeId=${club.college.id}`}>{club.college.name}</Link> · {members} member{members === 1 ? '' : 's'}
            {managers.length > 0 && ` · managed by ${managers.join(', ')}`}
          </p>
          {club.description && <p>{club.description}</p>}
          {club.requiresDues && <p className="small warn-text">Membership of this club needs a paid plan after approval.</p>}
        </div>
        <div className="club-hero-actions">
          {me?.can?.staff && (
            <Link className="btn btn-primary" to={`/c/${club.id}`}>
              Open club workspace
            </Link>
          )}
          <Link className="btn btn-ghost" to={`/clubs/${club.id}/shop`}>
            Club shop
          </Link>
        </div>
      </div>

      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Membership box */}
      <section className="card section-gap">
        <h3>Membership</h3>
        {!user && (
          <p>
            <Link to="/login" state={{ from: location.pathname }}>
              Log in
            </Link>{' '}
            or <Link to="/register">sign up</Link> to join this club.
          </p>
        )}
        {user && !me?.status && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act('join', () => api.post(`/clubs/${club.id}/join`, { message }), 'Request sent! The club manager will review it.');
            }}
          >
            <p className="muted">Ask to join: the club manager approves requests.</p>
            <label>
              Message to the manager (optional)
              <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="e.g. I'd love to help with the hackathon" />
            </label>
            <button className="btn btn-primary" disabled={busy === 'join'}>
              Ask to join
            </button>
          </form>
        )}
        {me?.status === 'PENDING' && (
          <div className="row-between">
            <p>
              <Badge status="PENDING">Request sent</Badge> Waiting for the club manager to approve you.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => act('leave', () => api.post(`/clubs/${club.id}/leave`), 'Request withdrawn.')}>
              Withdraw request
            </button>
          </div>
        )}
        {me?.status === 'REJECTED' && (
          <>
            <p>
              <Badge status="REJECTED">Not approved</Badge> {me.decisionNote && `“${me.decisionNote}”`}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => act('join', () => api.post(`/clubs/${club.id}/join`, {}), 'Request sent again.')}>
              Ask again
            </button>
          </>
        )}
        {(me?.status === 'LEFT' || me?.status === 'REMOVED') && (
          <>
            <p className="muted">{me.status === 'LEFT' ? 'You left this club.' : 'You were removed from this club.'}</p>
            {me.status === 'LEFT' && (
              <button className="btn btn-primary btn-sm" onClick={() => act('join', () => api.post(`/clubs/${club.id}/join`, {}), 'Request sent.')}>
                Ask to rejoin
              </button>
            )}
          </>
        )}
        {me?.status === 'ACTIVE' && (
          <div className="member-box">
            <MembershipCard name={user.name} club={club.name} collegeCode={club.college.code} role={me.role} memberNumber={me.memberNumber} paidUntil={me.membership?.endDate} qr={me.card} />
            <div>
              {me.duesRequired && !me.duesOk && <div className="alert alert-warn">Pay a membership plan below to get member prices and club-only events.</div>}
              {me.isMember && <p className="muted small">Show this card at club events. Member prices apply automatically.</p>}
              {me.upcoming && <p className="small">Renewed until {date(me.upcoming.endDate)}.</p>}
              {me.role !== 'MANAGER' && (
                <button className="link-btn small" onClick={() => confirm(`Leave ${club.name}?`) && act('leave', () => api.post(`/clubs/${club.id}/leave`), `You left ${club.name}.`)}>
                  Leave club
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {showPlans && (
        <section className="section-gap">
          <h2 className="section-title">{me.membership ? 'Renew membership' : 'Membership plans'}</h2>
          <div className="plan-grid">
            {plans.map((p) => (
              <div key={p.id} className="card plan-card">
                <h3>{p.name}</h3>
                <div className="plan-price">{money(p.price)}</div>
                <div className="muted small">{durationLabel(p)}</div>
                <ul className="benefits">
                  {benefitList(p.benefits).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <button className="btn btn-primary btn-block" disabled={!!busy} onClick={() => payDues(p.id)}>
                  {me.membership ? `Renew for ${money(p.price)}` : `Pay ${money(p.price)}`}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section-gap">
        <h2 className="section-title">Events</h2>
        {events.length === 0 ? <p className="muted">No upcoming events you can see.</p> : <div className="event-grid">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>}
      </section>

      <section className="section-gap" id="news">
        <h2 className="section-title">News</h2>
        {news.length === 0 && <p className="muted">No public announcements yet.</p>}
        {news.map((a) => (
          <article key={a.id} className="card news-card">
            <div className="muted small">{dateTime(a.publishedAt)}</div>
            <h3>{a.title}</h3>
            <p className="pre-wrap">{a.body}</p>
          </article>
        ))}
        <MailingList clubId={club.id} />
      </section>
    </div>
  );
}

function MailingList({ clubId }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post(`/clubs/${clubId}/mailing-list`, { email });
      setMsg({ type: 'success', text: r.data.message });
      setEmail('');
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };
  return (
    <form className="card signup-band" onSubmit={submit}>
      <div>
        <strong>Get this club’s news by email</strong>
        <p className="muted small">No account needed.</p>
      </div>
      <div className="inline-signup">
        <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
        <button className="btn btn-primary">Subscribe</button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type} small`}>{msg.text}</div>}
    </form>
  );
}
