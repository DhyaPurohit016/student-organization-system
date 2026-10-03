// College Head workspace: /college/:collegeId/*
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import ExpenseReview from '../../components/ExpenseReview';
import StatCard from '../../components/StatCard';
import { IncomeExpenseChart } from '../../components/Charts';
import { SemesterPresets } from '../club/ClubFinance';
import { date, dateTime, eventWhen, money } from '../../utils/format';
import { COLLEGE_STATUS, ROLE_LABEL, VISIBILITY } from '../../utils/roles';

const CollegeCtx = createContext(null);
const useCollege = () => useContext(CollegeCtx);

export function CollegeWorkspace() {
  const { collegeId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.get(`/colleges/${collegeId}/manage`).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err)));
  }, [collegeId]);
  useEffect(load, [load]);

  if (!data) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;
  const root = `/college/${collegeId}`;
  const base = `/colleges/${collegeId}/manage`;
  const tabs = [
    { to: root, label: 'Dashboard', end: true },
    { to: `${root}/clubs`, label: 'Clubs' },
    { to: `${root}/managers`, label: 'Club Managers' },
    { to: `${root}/students`, label: `Students${data.counts.pendingStudents ? ` (${data.counts.pendingStudents})` : ''}` },
    { to: `${root}/events`, label: 'Events' },
    { to: `${root}/volunteers`, label: 'Volunteers' },
    { to: `${root}/expenses`, label: `Expense Management${data.counts.pendingExpenses ? ` (${data.counts.pendingExpenses})` : ''}` },
    { to: `${root}/reports`, label: 'Reports' },
    { to: `${root}/announcements`, label: 'Announcements' },
    { to: `${root}/support`, label: `Support${data.counts.openSupport ? ` (${data.counts.openSupport})` : ''}` },
    { to: `${root}/settings`, label: 'Settings' },
  ];
  return (
    <CollegeCtx.Provider value={{ ...data, root, base, reload: load }}>
      <div className="club-head">
        <div className="club-head-main">
          <span className="club-logo placeholder">{data.college.code.slice(0, 2)}</span>
          <div>
            <h1>{data.college.name}</h1>
            <p className="muted small">
              College Head workspace · heads: {data.heads.map((h) => h.name).join(', ')}
            </p>
          </div>
        </div>
      </div>
      <nav className="tabs club-tabs">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet key={collegeId} />
    </CollegeCtx.Provider>
  );
}

export function CollegeOverview() {
  const { counts, finance, root } = useCollege();
  return (
    <>
      {(counts.pendingStudents > 0 || counts.pendingExpenses > 0 || counts.openSupport > 0) && (
        <div className="card todo-card">
          <h3>Needs attention</h3>
          <ul>
            {counts.pendingStudents > 0 && (
              <li>
                <Link to={`${root}/students?status=PENDING`}>
                  {counts.pendingStudents} student{counts.pendingStudents === 1 ? '' : 's'} waiting for approval →
                </Link>
              </li>
            )}
            {counts.pendingExpenses > 0 && (
              <li>
                <Link to={`${root}/expenses`}>
                  {counts.pendingExpenses} expense{counts.pendingExpenses === 1 ? '' : 's'} waiting to be approved or paid →
                </Link>
              </li>
            )}
            {counts.openSupport > 0 && (
              <li>
                <Link to={`${root}/support`}>
                  {counts.openSupport} help request{counts.openSupport === 1 ? '' : 's'} to answer →
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
      <div className="stat-grid">
        <StatCard label="Clubs" value={counts.clubs} to={`${root}/clubs`} />
        <StatCard label="Students" value={counts.students} to={`${root}/students`} />
        <StatCard label="Managers" value={counts.managers} to={`${root}/managers`} />
        <StatCard label="Upcoming Events" value={counts.upcomingEvents} to={`${root}/events`} />
        <StatCard label="Pending Expenses" value={counts.pendingExpenses} to={`${root}/expenses`} />
        <StatCard label="Money in (all clubs)" value={finance.totalIncome} money to={`${root}/reports`} />
        <div className="stat-card highlight">
          <div className="stat-label">Balance (all clubs)</div>
          <div className="stat-value">{money(finance.balance)}</div>
        </div>
      </div>
      <section className="card section-gap">
        <h3>Money in and out across all clubs</h3>
        <IncomeExpenseChart data={finance.monthly} />
      </section>
    </>
  );
}

export function CollegeClubs() {
  const { base } = useCollege();
  const [clubs, setClubs] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [creating, setCreating] = useState(false);
  const [managerFor, setManagerFor] = useState(null);

  const load = useCallback(() => {
    api.get(`${base}/clubs`).then((r) => setClubs(r.data.clubs)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [base]);
  useEffect(load, [load]);

  const toggleArchive = async (c) => {
    if (!confirm(c.status === 'ACTIVE' ? `Archive ${c.name}? It disappears from the public site.` : `Restore ${c.name}?`)) return;
    try {
      await api.patch(`${base}/clubs/${c.id}`, { status: c.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Clubs</h2>
          <p className="muted">Create clubs and appoint their managers. Managers run everything inside their club.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New club
        </button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Club</th>
              <th>Managers</th>
              <th className="right">Members</th>
              <th className="right">Requests</th>
              <th className="right">Upcoming events</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {clubs?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No clubs yet. Create the first one.
                </td>
              </tr>
            )}
            {clubs?.map((c) => (
              <tr key={c.id} className={c.status === 'ARCHIVED' ? 'muted' : ''}>
                <td>
                  <Link to={`/c/${c.id}`} className="strong-link">
                    {c.name}
                  </Link>{' '}
                  {c.status === 'ARCHIVED' && <Badge status="CANCELLED">Archived</Badge>}
                  <div className="muted small">
                    {c.code}
                    {c.requiresDues && ' · dues required'}
                  </div>
                </td>
                <td>
                  {c.managers.length ? c.managers.map((m) => m.name).join(', ') : <span className="warn-text">No manager</span>}
                  <div>
                    <button className="link-btn small" onClick={() => setManagerFor(c)}>
                      + Appoint manager
                    </button>
                  </div>
                </td>
                <td className="right">{c.members}</td>
                <td className="right">{c.pendingRequests}</td>
                <td className="right">{c.upcomingEvents}</td>
                <td className="right">
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleArchive(c)}>
                    {c.status === 'ACTIVE' ? 'Archive' : 'Restore'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <NewClub onClose={() => setCreating(false)} onDone={(text) => { setCreating(false); setMsg({ type: 'success', text }); load(); }} />}
      {managerFor && <AppointManager club={managerFor} onClose={() => setManagerFor(null)} onDone={(text) => { setManagerFor(null); setMsg({ type: 'success', text }); load(); }} />}
    </>
  );
}

function NewClub({ onClose, onDone }) {
  const { base } = useCollege();
  const { refreshContext } = useAuth();
  const [form, setForm] = useState({ name: '', code: '', description: '', managerEmail: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/clubs`, { ...form, managerEmail: form.managerEmail || undefined });
      refreshContext();
      onDone(`${form.name} created.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title="New club" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="row-2">
          <label>
            Name
            <input required value={form.name} onChange={set('name')} placeholder="e.g. Coding Club" autoFocus />
          </label>
          <label>
            Short code
            <input required value={form.code} onChange={set('code')} placeholder="CODE" maxLength={10} pattern="[A-Z0-9]{2,10}" title="2–10 letters or digits" />
          </label>
        </div>
        <label>
          Description
          <textarea rows={2} value={form.description} onChange={set('description')} />
        </label>
        <label>
          Club manager’s email (optional)
          <input type="email" value={form.managerEmail} onChange={set('managerEmail')} placeholder="They need an account already" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Create club</button>
        </div>
      </form>
    </Modal>
  );
}

function AppointManager({ club, onClose, onDone }) {
  const { base } = useCollege();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/clubs/${club.id}/managers`, { email });
      onDone(`${email} is now a manager of ${club.name}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title={`Appoint a manager · ${club.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Email of the new manager
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <p className="muted small">To replace a manager, appoint the new one first, then change the old one’s role in the club’s Members tab.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Appoint</button>
        </div>
      </form>
    </Modal>
  );
}

export function CollegeStudents() {
  const { base, college, reload } = useCollege();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || (college.approveStudents ? 'PENDING' : 'VERIFIED');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    const q = new URLSearchParams({ status });
    if (search) q.set('search', search);
    api.get(`${base}/students?${q}`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [base, status, search]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const decide = async (u, decision) => {
    try {
      await api.post(`${base}/students/${u.id}/decision`, { decision });
      setMsg({ type: 'success', text: `${u.name} ${decision === 'VERIFIED' ? 'verified' : 'rejected'}.` });
      load();
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head">
        <h2>Students</h2>
        <p className="muted">
          People who chose {college.name} when signing up. {college.approveStudents ? 'You approve each one before they count as students.' : 'Approval is switched off: choosing the college is trusted.'}
        </p>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="tabs">
        {['PENDING', 'VERIFIED', 'REJECTED'].map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setParams({ status: s }, { replace: true })}>
            {COLLEGE_STATUS[s].label}
            {data?.counts?.[s] ? <span className="tab-count">{data.counts[s]}</span> : null}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search name, email or student ID" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Student ID</th>
              <th>Signed up</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.students.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  Nobody here.
                </td>
              </tr>
            )}
            {data?.students.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <div className="muted small">{u.email}</div>
                </td>
                <td>{u.studentId || '—'}</td>
                <td>{date(u.createdAt)}</td>
                <td className="right">
                  <div className="row-actions">
                    {u.collegeStatus !== 'VERIFIED' && (
                      <button className="btn btn-primary btn-sm" onClick={() => decide(u, 'VERIFIED')}>
                        Verify
                      </button>
                    )}
                    {u.collegeStatus !== 'REJECTED' && (
                      <button className="btn btn-danger-ghost btn-sm" onClick={() => confirm(`Mark ${u.name} as not a student of ${college.name}?`) && decide(u, 'REJECTED')}>
                        Not a student
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function CollegeEvents() {
  const { base } = useCollege();
  const [events, setEvents] = useState(null);
  useEffect(() => {
    api.get(`${base}/events`).then((r) => setEvents(r.data.events)).catch(() => setEvents([]));
  }, [base]);
  return (
    <>
      <div className="page-head">
        <h2>Events across all clubs</h2>
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Club</th>
              <th>Who can register</th>
              <th>Status</th>
              <th className="right">Registered</th>
            </tr>
          </thead>
          <tbody>
            {events?.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No events yet.
                </td>
              </tr>
            )}
            {events?.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link to={`/c/${e.clubId}/events/${e.id}`} className="strong-link">
                    {e.title}
                  </Link>
                  <div className="muted small">{eventWhen(e)}</div>
                </td>
                <td>{e.club?.name}</td>
                <td>
                  <Badge status={e.visibility}>{VISIBILITY[e.visibility].label}</Badge>
                </td>
                <td>
                  <Badge status={e.status} />
                </td>
                <td className="right">
                  {e.sold}/{e.capacity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function CollegeReports() {
  const { base } = useCollege();
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v));
    api.get(`${base}/finance?${q}`).then((r) => setData(r.data)).catch(() => {});
  }, [base, range]);
  return (
    <>
      <div className="page-head">
        <h2>Reports</h2>
        <p className="muted">Every club side by side: members, events, attendance and money. Open a club for its full report.</p>
      </div>
      <div className="toolbar range-bar">
        <label className="inline-label">
          From
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="inline-label">
          To
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <SemesterPresets onPick={setRange} />
      </div>
      {!data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Money in" value={data.total.totalIncome} money />
            <StatCard label="Money out" value={data.total.totalExpense} money />
            <StatCard label="Net" value={data.total.net} money />
            <StatCard label="Balance (all time)" value={data.total.balance} money />
          </div>
          <div className="card table-card section-gap">
            <table className="table">
              <thead>
                <tr>
                  <th>Club</th>
                  <th className="right">Members</th>
                  <th className="right">Events</th>
                  <th className="right">Registrations</th>
                  <th className="right">Attended</th>
                  <th className="right">In</th>
                  <th className="right">Out</th>
                  <th className="right">Net</th>
                  <th className="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.clubs.map((c) => (
                  <tr key={c.clubId}>
                    <td>
                      <Link to={`/c/${c.clubId}/report`} className="strong-link">
                        {c.name}
                      </Link>
                      {c.status === 'ARCHIVED' && <span className="muted small"> · archived</span>}
                    </td>
                    <td className="right">{c.members}</td>
                    <td className="right">{c.events}</td>
                    <td className="right">{c.ticketsSold}</td>
                    <td className="right">{c.ticketsSold ? `${Math.round((c.checkedIn / c.ticketsSold) * 100)}%` : '—'}</td>
                    <td className="right">{money(c.totalIncome)}</td>
                    <td className="right">{money(c.totalExpense)}</td>
                    <td className={`right ${c.net < 0 ? 'danger-text' : ''}`}>{money(c.net)}</td>
                    <td className="right">{money(c.balance)}</td>
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

export function CollegeAnnouncements() {
  const { base } = useCollege();
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', audience: 'COLLEGE', sendEmail: false });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const load = useCallback(() => {
    api.get(`${base}/announcements`).then((r) => setList(r.data.announcements)).catch(() => {});
  }, [base]);
  useEffect(load, [load]);

  const post = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/announcements`, { ...form, publish: true });
      setForm({ title: '', body: '', audience: 'COLLEGE', sendEmail: false });
      setMsg({ type: 'success', text: 'Published to the college.' });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head">
        <h2>Announcements</h2>
        <p className="muted">College-wide notices go to every verified student. Club announcements are shown here too.</p>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="grid-2">
        <form className="card" onSubmit={post}>
          <h3>New college announcement</h3>
          <label>
            Title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            Message
            <textarea rows={5} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <label>
            Who sees it
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="COLLEGE">Students of this college</option>
              <option value="PUBLIC">Everyone (public website too)</option>
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} />
            Also email it
          </label>
          <button className="btn btn-primary">Publish</button>
        </form>
        <section className="stack">
          {list?.map((a) => (
            <article key={a.id} className="card news-card">
              <div className="row-between">
                <span className="muted small">
                  {a.club ? a.club.name : 'College-wide'} · {a.publishedAt ? dateTime(a.publishedAt) : 'Draft'}
                  {a.author && ` · ${a.author.name}`}
                </span>
                <Badge status={a.audience} />
              </div>
              <h3>{a.title}</h3>
              <p className="clamp-3">{a.body}</p>
              {!a.club && (
                <button className="link-btn small danger-text" onClick={async () => confirm('Delete this announcement?') && (await api.delete(`${base}/announcements/${a.id}`), load())}>
                  Delete
                </button>
              )}
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

export function CollegeSettings() {
  const { base, college, reload } = useCollege();
  const [form, setForm] = useState({ name: college.name, city: college.city || '', address: college.address || '', email: college.email || '', phone: college.phone || '', approveStudents: college.approveStudents });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.patch(base, form);
      setMsg({ type: 'success', text: 'Saved.' });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };
  return (
    <form className="card narrow-left" onSubmit={save}>
      <h3>College settings</h3>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <label>
        Name
        <input required value={form.name} onChange={set('name')} />
      </label>
      <div className="row-2">
        <label>
          City
          <input value={form.city} onChange={set('city')} />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={set('phone')} />
        </label>
      </div>
      <label>
        Contact email
        <input type="email" value={form.email} onChange={set('email')} />
      </label>
      <label>
        Address
        <input value={form.address} onChange={set('address')} />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={form.approveStudents} onChange={(e) => setForm({ ...form, approveStudents: e.target.checked })} />
        Approve new students before they count as students of this college
      </label>
      <p className="muted small">When off, anyone who picks this college at sign-up is treated as a student straight away (they can enter college-only events).</p>
      <button className="btn btn-primary">Save</button>
    </form>
  );
}

// ---------- Club Managers ----------

export function CollegeManagers() {
  const { base, reload } = useCollege();
  const [people, setPeople] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [appointing, setAppointing] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api.get(`${base}/people?role=MANAGER`).then((r) => setPeople(r.data.people)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
    api.get(`${base}/clubs`).then((r) => setClubs(r.data.clubs.filter((c) => c.status === 'ACTIVE'))).catch(() => {});
  }, [base]);
  useEffect(load, [load]);

  const remove = async (p) => {
    if (!confirm(`Remove ${p.user.name} as manager of ${p.club.name}? They stay in the club as a member.`)) return;
    try {
      await api.delete(`${base}/clubs/${p.club.id}/managers/${p.user.id}`);
      setMsg({ type: 'success', text: `${p.user.name} is no longer a manager of ${p.club.name}.` });
      load();
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };
  const without = clubs.filter((c) => c.managers.length === 0);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Club Managers</h2>
          <p className="muted">Each club is run by its managers. Appoint someone with an account; to replace a manager, appoint the new one first.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAppointing(true)} disabled={!clubs.length}>
          + Appoint manager
        </button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {without.length > 0 && <div className="alert alert-warn">No manager yet: {without.map((c) => c.name).join(', ')}.</div>}
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Manager</th>
              <th>Club</th>
              <th className="right">Upcoming events helping at</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {people?.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No managers yet.
                </td>
              </tr>
            )}
            {people?.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.user.name}</strong>
                  <div className="muted small">
                    {p.user.email}
                    {p.user.phone && ` · ${p.user.phone}`}
                  </div>
                </td>
                <td>
                  <Link to={`/c/${p.club.id}`}>{p.club.name}</Link>
                </td>
                <td className="right">{p.upcomingEvents}</td>
                <td className="right">
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(p)}>
                    Remove as manager
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {appointing && (
        <AppointAnyClub
          clubs={clubs}
          onClose={() => setAppointing(false)}
          onDone={(text) => {
            setAppointing(false);
            setMsg({ type: 'success', text });
            load();
            reload();
          }}
        />
      )}
    </>
  );
}

function AppointAnyClub({ clubs, onClose, onDone }) {
  const { base } = useCollege();
  const [clubId, setClubId] = useState(clubs.find((c) => c.managers.length === 0)?.id || clubs[0]?.id);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/clubs/${clubId}/managers`, { email });
      onDone(`${email} is now a manager of ${clubs.find((c) => String(c.id) === String(clubId))?.name}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title="Appoint a club manager" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Club
          <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.managers.length === 0 ? ' (no manager)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Their account email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Appoint</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Volunteers ----------

export function CollegeVolunteers() {
  const { base } = useCollege();
  const [people, setPeople] = useState(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    api.get(`${base}/people`).then((r) => setPeople(r.data.people)).catch(() => setPeople([]));
  }, [base]);
  const q = search.trim().toLowerCase();
  const rows = (people || []).filter((p) => p.role !== 'MANAGER' && (!q || p.user.name.toLowerCase().includes(q) || p.club.name.toLowerCase().includes(q)));
  return (
    <>
      <div className="page-head">
        <h2>Volunteers</h2>
        <p className="muted">Volunteers and treasurers in every club of the college. Club managers decide who helps at which event.</p>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search name or club" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Volunteer</th>
              <th>Club</th>
              <th>Role</th>
              <th className="right">Upcoming events</th>
            </tr>
          </thead>
          <tbody>
            {people && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No volunteers found.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.user.name}</strong>
                  <div className="muted small">{p.user.email}</div>
                </td>
                <td>
                  <Link to={`/c/${p.club.id}/volunteers`}>{p.club.name}</Link>
                </td>
                <td>
                  <span className={`role-badge role-${p.role.toLowerCase()}`}>{ROLE_LABEL[p.role]}</span>
                </td>
                <td className="right">{p.upcomingEvents}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- Expense Management ----------

export function CollegeExpenses() {
  const { base, reload } = useCollege();
  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Expense Management</h2>
          <p className="muted">Expenses submitted by volunteers and members in every club. Approve or reject them, then mark approved ones as paid.</p>
        </div>
        <Link to="/expenses" className="btn btn-ghost">
          My Expenses
        </Link>
      </div>
      <ExpenseReview listUrl={`${base}/expenses`} showClub onChange={reload} />
    </>
  );
}

// ---------- Support requests ----------

export function CollegeSupport() {
  const { base, reload } = useCollege();
  return <SupportInbox listUrl={`${base}/support`} resolveUrl={(id) => `${base}/support/${id}/resolve`} onChange={reload} intro="Questions from students of your college. Your reply is sent to them as a notification." />;
}

// Shared by the College Head and the Platform Admin
export function SupportInbox({ listUrl, resolveUrl, intro, onChange }) {
  const [status, setStatus] = useState('OPEN');
  const [data, setData] = useState(null);
  const [replies, setReplies] = useState({});
  const [msg, setMsg] = useState({ type: '', text: '' });
  const load = useCallback(() => {
    api.get(`${listUrl}${status ? `?status=${status}` : ''}`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [listUrl, status]);
  useEffect(load, [load]);

  const resolve = async (r) => {
    try {
      await api.post(resolveUrl(r.id), { reply: replies[r.id] || '' });
      setMsg({ type: 'success', text: `Answered ${r.user.name}.` });
      load();
      onChange?.();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head">
        <h2>Support requests</h2>
        <p className="muted">{intro}</p>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="tabs">
        {[
          ['OPEN', `Open${data?.open ? ` (${data.open})` : ''}`],
          ['RESOLVED', 'Resolved'],
          ['', 'All'],
        ].map(([k, l]) => (
          <button key={k || 'all'} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
      </div>
      {!data && <p className="muted">Loading…</p>}
      {data?.requests.length === 0 && <div className="card empty-state">{status === 'OPEN' ? 'No open requests. 🎉' : 'Nothing here.'}</div>}
      <div className="stack">
        {data?.requests.map((r) => (
          <article key={r.id} className="card">
            <div className="row-between">
              <strong>{r.subject}</strong>
              <Badge status={r.status} />
            </div>
            <div className="muted small">
              {r.user.name} · {r.user.email} · {dateTime(r.createdAt)}
            </div>
            <p className="pre-wrap">{r.message}</p>
            {r.status === 'RESOLVED' ? (
              <p className="support-reply small">
                <strong>{r.resolvedBy?.name}:</strong> {r.reply}
              </p>
            ) : (
              <div className="reply-form">
                <textarea rows={2} placeholder="Write a reply…" value={replies[r.id] || ''} onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })} aria-label={`Reply to ${r.user.name}`} />
                <button className="btn btn-primary btn-sm" onClick={() => resolve(r)} disabled={!replies[r.id]?.trim()}>
                  Reply & resolve
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
