// Platform Admin pages: /platform, /platform/colleges, /platform/users
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import StatCard from '../../components/StatCard';
import TempPasswordNotice from '../../components/TempPasswordNotice';
import { date, money } from '../../utils/format';
import { COLLEGE_STATUS } from '../../utils/roles';
import { SupportInbox } from '../college/College';
import { SemesterPresets } from '../club/ClubFinance';

export function PlatformOverview() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get('/platform/stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);
  return (
    <>
      <div className="page-head">
        <h1>Platform Admin</h1>
        <p className="muted">You add colleges and their College Heads. Heads create clubs; club managers run them.</p>
      </div>
      {stats?.openSupport > 0 && (
        <div className="card todo-card">
          <h3>Needs attention</h3>
          <ul>
            <li>
              <Link to="/platform/support">
                {stats.openSupport} support request{stats.openSupport === 1 ? '' : 's'} to answer →
              </Link>
            </li>
          </ul>
        </div>
      )}
      {stats && (
        <div className="stat-grid">
          <StatCard label="Colleges" value={stats.colleges} to="/platform/colleges" />
          <StatCard label="College Heads" value={stats.collegeHeads} to="/platform/colleges" />
          <StatCard label="Total Users" value={stats.users} to="/platform/users" />
          <StatCard label="Active Clubs" value={stats.clubs} to="/platform/reports" />
          <StatCard label="Upcoming Events" value={stats.upcomingEvents} to="/platform/reports" />
          <StatCard label="Tickets issued" value={stats.tickets} />
        </div>
      )}
      <div className="quick-links section-gap">
        <Link className="card quick-link" to="/platform/colleges">
          <strong>Colleges & Heads</strong>
          <span className="muted small">Add colleges, appoint or remove College Heads</span>
        </Link>
        <Link className="card quick-link" to="/platform/users">
          <strong>Users</strong>
          <span className="muted small">Find accounts, reset passwords, disable</span>
        </Link>
        <Link className="card quick-link" to="/platform/reports">
          <strong>Reports</strong>
          <span className="muted small">Every college side by side</span>
        </Link>
        <Link className="card quick-link" to="/platform/support">
          <strong>Help & Support</strong>
          <span className="muted small">Answer questions sent to the platform</span>
        </Link>
      </div>
    </>
  );
}

export function PlatformColleges() {
  const [colleges, setColleges] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [editing, setEditing] = useState(null); // {} = new college
  const [headFor, setHeadFor] = useState(null);
  const load = useCallback(() => {
    api.get('/platform/colleges').then((r) => setColleges(r.data.colleges)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, []);
  useEffect(load, [load]);
  const done = (text) => {
    setEditing(null);
    setHeadFor(null);
    setMsg({ type: 'success', text });
    load();
  };

  const removeHead = async (c, h) => {
    if (!confirm(`Remove ${h.name} as College Head of ${c.name}?`)) return;
    try {
      await api.delete(`/platform/colleges/${c.id}/heads/${h.id}`);
      done(`${h.name} is no longer a College Head.`);
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>Colleges & College Heads</h1>
          <p className="muted">Each college has one or more College Heads who create its clubs.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          + New college
        </button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>College</th>
              <th>College Heads</th>
              <th className="right">Clubs</th>
              <th className="right">Students</th>
              <th>Student approval</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {colleges?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No colleges yet.
                </td>
              </tr>
            )}
            {colleges?.map((c) => (
              <tr key={c.id} className={c.status !== 'ACTIVE' ? 'muted' : ''}>
                <td>
                  <Link to={`/college/${c.id}`} className="strong-link">
                    {c.name}
                  </Link>{' '}
                  {c.status !== 'ACTIVE' && <Badge status="DISABLED">Inactive</Badge>}
                  <div className="muted small">
                    {c.code}
                    {c.city && ` · ${c.city}`}
                  </div>
                </td>
                <td>
                  {c.heads.length === 0 && <span className="warn-text">No head yet</span>}
                  {c.heads.map((h) => (
                    <div key={h.id} className="small">
                      {h.name} <span className="muted">{h.email}</span>{' '}
                      <button className="link-btn small danger-text" onClick={() => removeHead(c, h)} aria-label={`Remove ${h.name}`}>
                        remove
                      </button>
                    </div>
                  ))}
                  <button className="link-btn small" onClick={() => setHeadFor(c)}>
                    + Add head
                  </button>
                </td>
                <td className="right">{c.clubs}</td>
                <td className="right">{c.students}</td>
                <td>{c.approveStudents ? 'Head approves' : 'Trusted'}</td>
                <td className="right">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CollegeModal college={editing} onClose={() => setEditing(null)} onDone={done} />}
      {headFor && <AddHead college={headFor} onClose={() => setHeadFor(null)} onDone={done} />}
    </>
  );
}

function CollegeModal({ college, onClose, onDone }) {
  const isNew = !college.id;
  const [form, setForm] = useState({
    name: college.name || '',
    code: college.code || '',
    city: college.city || '',
    email: college.email || '',
    approveStudents: college.approveStudents ?? true,
    status: college.status || 'ACTIVE',
    headEmail: '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { headEmail, ...rest } = form;
      if (isNew) await api.post('/platform/colleges', { ...rest, headEmail: headEmail || undefined });
      else await api.patch(`/platform/colleges/${college.id}`, rest);
      onDone(isNew ? `${form.name} added.` : 'College saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title={isNew ? 'New college' : `Edit ${college.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="row-2">
          <label>
            Name
            <input required value={form.name} onChange={set('name')} autoFocus />
          </label>
          <label>
            Short code
            <input required value={form.code} onChange={set('code')} maxLength={10} pattern="[A-Z0-9]{2,10}" title="2–10 letters or digits" placeholder="LDCE" />
          </label>
        </div>
        <div className="row-2">
          <label>
            City
            <input value={form.city} onChange={set('city')} />
          </label>
          <label>
            Contact email
            <input type="email" value={form.email} onChange={set('email')} />
          </label>
        </div>
        {isNew ? (
          <label>
            College Head’s email (optional)
            <input type="email" value={form.headEmail} onChange={set('headEmail')} placeholder="They need an account already" />
          </label>
        ) : (
          <label>
            Status
            <select value={form.status} onChange={set('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive (hidden)</option>
            </select>
          </label>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={form.approveStudents} onChange={(e) => setForm({ ...form, approveStudents: e.target.checked })} />
          College Head approves new students
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">{isNew ? 'Add college' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AddHead({ college, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/platform/colleges/${college.id}/heads`, { email });
      onDone(`${email} is now a College Head of ${college.name}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title={`Add College Head · ${college.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Their account email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <p className="muted small">Their college is set to {college.name} and marked verified.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Add head</button>
        </div>
      </form>
    </Modal>
  );
}

export function PlatformUsers() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [temp, setTemp] = useState(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page });
    if (search) q.set('search', search);
    api.get(`/platform/users?${q}`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [search, page]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const update = async (u, changes, text) => {
    try {
      await api.patch(`/platform/users/${u.id}`, changes);
      setMsg({ type: 'success', text });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };
  const reset = async (u) => {
    if (!confirm(`Reset ${u.name}'s password? Their current password stops working.`)) return;
    try {
      const r = await api.post(`/platform/users/${u.id}/reset-password`);
      setTemp({ email: u.email, password: r.data.temporaryPassword });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <p className="muted">{data ? `${data.total} accounts` : ' '}</p>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {temp && <TempPasswordNotice email={temp.email} password={temp.password} />}
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search name, email or student ID"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>College</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.users.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No matching accounts.
                </td>
              </tr>
            )}
            {data?.users.map((u) => (
              <tr key={u.id} className={u.isActive ? '' : 'muted'}>
                <td>
                  <strong>{u.name}</strong> {u.role === 'PLATFORM_ADMIN' && <Badge status="APPROVED">Platform admin</Badge>} {!u.isActive && <Badge status="DISABLED" />}
                  <div className="muted small">{u.email}</div>
                </td>
                <td>
                  {u.college ? u.college.code : '—'}
                  <div className="muted small">{COLLEGE_STATUS[u.collegeStatus]?.label}</div>
                </td>
                <td>{date(u.createdAt)}</td>
                <td className="right">
                  {u.id !== me.id && (
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => reset(u)}>
                        Reset password
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          confirm(u.role === 'PLATFORM_ADMIN' ? `Remove platform admin from ${u.name}?` : `Make ${u.name} a Platform Admin? This account will leave its college and can no longer take part in clubs.`) &&
                          update(u, { role: u.role === 'PLATFORM_ADMIN' ? 'USER' : 'PLATFORM_ADMIN' }, 'Role updated.')
                        }
                      >
                        {u.role === 'PLATFORM_ADMIN' ? 'Remove admin' : 'Make admin'}
                      </button>
                      <button className={`btn btn-sm ${u.isActive ? 'btn-danger-ghost' : 'btn-ghost'}`} onClick={() => update(u, { isActive: !u.isActive }, u.isActive ? `${u.name} disabled.` : `${u.name} enabled.`)}>
                        {u.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span className="muted small">
            Page {data.page} of {data.pages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
    </>
  );
}

export function PlatformReports() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v));
    api.get(`/platform/reports?${q}`).then((r) => setData(r.data)).catch(() => {});
  }, [range]);
  return (
    <>
      <div className="page-head">
        <h1>Platform Reports</h1>
        <p className="muted">Every college side by side. Events, registrations and money are for the chosen dates.</p>
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
        {(range.from || range.to) && (
          <button className="link-btn" onClick={() => setRange({ from: '', to: '' })}>
            All time
          </button>
        )}
      </div>
      {!data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Clubs" value={data.total.clubs} />
            <StatCard label="Verified students" value={data.total.students} />
            <StatCard label="Events" value={data.total.events} />
            <StatCard label="Registrations" value={data.total.ticketsSold} />
            <StatCard label="Money in (all clubs)" value={data.total.income} money />
            <StatCard label="Money out (all clubs)" value={data.total.expense} money />
          </div>
          <div className="card table-card section-gap">
            <table className="table">
              <thead>
                <tr>
                  <th>College</th>
                  <th className="right">Clubs</th>
                  <th className="right">Students</th>
                  <th className="right">Events</th>
                  <th className="right">Registrations</th>
                  <th className="right">Attended</th>
                  <th className="right">In</th>
                  <th className="right">Out</th>
                </tr>
              </thead>
              <tbody>
                {data.colleges.map((c) => (
                  <tr key={c.id} className={c.status !== 'ACTIVE' ? 'muted' : ''}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="muted small">{c.code}</div>
                    </td>
                    <td className="right">{c.clubs}</td>
                    <td className="right">{c.students}</td>
                    <td className="right">{c.events}</td>
                    <td className="right">{c.ticketsSold}</td>
                    <td className="right">{c.ticketsSold ? `${Math.round((c.checkedIn / c.ticketsSold) * 100)}%` : '—'}</td>
                    <td className="right">{money(c.income)}</td>
                    <td className="right">{money(c.expense)}</td>
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

export function PlatformSupport() {
  return (
    <SupportInbox
      listUrl="/platform/support"
      resolveUrl={(id) => `/platform/support/${id}/resolve`}
      intro="Questions from guests, College Heads, and anyone who chose to contact the platform. Students' questions go to their College Head first."
    />
  );
}

function SettingRow({ label, children }) {
  return (
    <div className="setting-row">
      <span className="muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function PlatformSettings() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api.get('/platform/settings').then((r) => setS(r.data)).catch(() => {});
  }, []);
  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted">How this installation is set up. These come from the server's .env file: change them there and restart the API.</p>
      </div>
      {!s && <p className="muted">Loading…</p>}
      {s && (
        <div className="grid-2">
          <section className="card">
            <h3>Payments</h3>
            <SettingRow label="Provider">{s.payments.provider === 'razorpay' ? 'Razorpay' : 'Test mode (no real money)'}</SettingRow>
            {s.payments.provider === 'razorpay' && (
              <>
                <SettingRow label="Mode">
                  <Badge status={s.payments.mode === 'live' ? 'ACTIVE' : 'PENDING'}>{s.payments.mode === 'live' ? 'Live' : 'Test keys'}</Badge>
                </SettingRow>
                <SettingRow label="Webhook">{s.payments.webhook ? 'Configured' : 'Not set'}</SettingRow>
              </>
            )}
            <p className="muted small">Set PAYMENT_PROVIDER, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env.</p>
          </section>
          <section className="card">
            <h3>Email</h3>
            <SettingRow label="Sending">{s.email.configured ? 'SMTP configured' : 'Not configured (emails are only logged)'}</SettingRow>
            {s.email.from && <SettingRow label="From">{s.email.from}</SettingRow>}
            <p className="muted small">Set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM in server/.env.</p>
          </section>
          <section className="card">
            <h3>System</h3>
            <SettingRow label="Environment">{s.environment}</SettingRow>
            <SettingRow label="Website address">{s.clientUrl}</SettingRow>
            <SettingRow label="Platform Admins">{s.platformAdmins}</SettingRow>
          </section>
          <section className="card">
            <h3>Student approval</h3>
            <p className="small">Each college chooses whether its College Head approves new students. Change it per college under Colleges & Heads → Edit.</p>
          </section>
        </div>
      )}
    </>
  );
}
