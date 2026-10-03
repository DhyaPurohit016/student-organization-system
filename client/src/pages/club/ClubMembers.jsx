import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { date, dateTime, money } from '../../utils/format';
import { CLUB_ROLE_OPTIONS, ROLE_LABEL } from '../../utils/roles';

const TABS = [
  { key: 'ACTIVE', label: 'Members' },
  { key: 'PENDING', label: 'Join requests' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'REMOVED', label: 'Removed' },
  { key: 'LEFT', label: 'Left' },
];

// Club members: approve join requests, give roles, add people, record dues
export default function ClubMembers() {
  const { base, club, can } = useClub();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'ACTIVE';
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ status });
    if (search) q.set('search', search);
    if (role) q.set('role', role);
    api.get(`${base}/members?${q}`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [base, status, search, role]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn, text) => {
    setMsg({ type: '', text: '' });
    try {
      await fn();
      setMsg({ type: 'success', text });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  // Managers are appointed by the College Head (College → Club Managers), never from here
  const roleChoices = CLUB_ROLE_OPTIONS.filter((r) => r.value !== 'MANAGER');

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Members</h2>
          <p className="muted">
            Students ask to join from the club page; you approve them here.{club.requiresDues && ' This club requires paid dues.'}
          </p>
        </div>
        {can.manage && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add by email
          </button>
        )}
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={status === t.key} className={status === t.key ? 'on' : ''} onClick={() => setParams({ status: t.key }, { replace: true })}>
            {t.label}
            {data?.counts?.[t.key] ? <span className="tab-count">{data.counts[t.key]}</span> : null}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search name, email or student ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        {status === 'ACTIVE' && (
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {CLUB_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}s
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>College</th>
              {status === 'ACTIVE' ? (
                <>
                  <th>Role</th>
                  <th>Member no.</th>
                  {club.requiresDues && <th>Dues</th>}
                </>
              ) : (
                <th>{status === 'PENDING' ? 'Message' : 'Note'}</th>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={6} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {data?.members.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {status === 'PENDING' ? 'No join requests right now.' : 'Nobody here.'}
                </td>
              </tr>
            )}
            {data?.members.map((m) => (
              <tr key={m.id}>
                <td>
                  <button className="link-btn strong-link" onClick={() => setDetail(m)}>
                    {m.user.name}
                  </button>
                  <div className="muted small">
                    {m.user.email}
                    {m.user.studentId && ` · ${m.user.studentId}`}
                  </div>
                </td>
                <td>
                  {m.user.college ? m.user.college.code : <span className="muted">Guest</span>}
                  <div className="small">{m.sameCollege ? <Badge status="ACTIVE">Our college</Badge> : m.user.collegeStatus === 'PENDING' ? <Badge status="PENDING">Unverified</Badge> : null}</div>
                </td>
                {status === 'ACTIVE' ? (
                  <>
                    <td>
                      <select
                        value={m.role}
                        onChange={(e) => act(() => api.patch(`${base}/members/${m.id}`, { role: e.target.value }), `${m.user.name} is now ${ROLE_LABEL[e.target.value].toLowerCase()}.`)}
                        disabled={m.role === 'MANAGER' || !can.manage}
                        title={m.role === 'MANAGER' ? 'Club managers are appointed and removed by the College Head' : undefined}
                        aria-label={`Role of ${m.user.name}`}
                      >
                        {(m.role === 'MANAGER' ? CLUB_ROLE_OPTIONS : roleChoices).map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono small">{m.memberNumber}</td>
                    {club.requiresDues && <td>{m.role !== 'MEMBER' ? <span className="muted small">Staff</span> : m.dues ? <Badge status="ACTIVE">Until {date(m.dues.endDate)}</Badge> : <Badge status="EXPIRED">Not paid</Badge>}</td>}
                    <td className="right">
                      {can.manage && m.role !== 'MANAGER' && (
                        <button className="btn btn-danger-ghost btn-sm" onClick={() => confirm(`Remove ${m.user.name} from the club?`) && act(() => api.delete(`${base}/members/${m.id}`), 'Removed from the club.')}>
                          Remove
                        </button>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="small">{status === 'PENDING' ? m.message || <span className="muted">—</span> : m.decisionNote || <span className="muted">—</span>}</td>
                    <td className="right">
                      {status === 'PENDING' && can.manage && (
                        <div className="row-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => act(() => api.post(`${base}/members/${m.id}/decision`, { decision: 'APPROVE' }), `${m.user.name} approved.`)}>
                            Approve
                          </button>
                          <button
                            className="btn btn-danger-ghost btn-sm"
                            onClick={() => {
                              const note = prompt(`Reason for rejecting ${m.user.name} (they will see this):`);
                              if (note) act(() => api.post(`${base}/members/${m.id}/decision`, { decision: 'REJECT', note }), 'Request rejected.');
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && <AddMember roleChoices={roleChoices} onClose={() => setAdding(false)} onDone={(text) => { setAdding(false); setMsg({ type: 'success', text }); load(); }} />}
      {detail && <MemberDetail member={detail} onClose={() => { setDetail(null); load(); }} />}
    </>
  );
}

function AddMember({ roleChoices, onClose, onDone }) {
  const { base } = useClub();
  const [form, setForm] = useState({ email: '', role: 'MEMBER' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/members`, form);
      onDone(`${form.email} added.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title="Add someone to the club" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <p className="muted small">They need an account already. They’re added straight away and get a member card.</p>
        <label>
          Email
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus />
        </label>
        <label>
          Role
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roleChoices.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Add</button>
        </div>
      </form>
    </Modal>
  );
}

// One member: card, dues history, payments; record dues paid in person
function MemberDetail({ member, onClose }) {
  const { base, can } = useClub();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [pay, setPay] = useState({ planId: '', paymentMethod: 'CASH' });
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api.get(`${base}/members/${member.id}`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [base, member.id]);
  useEffect(() => {
    load();
    api.get(`${base}/plans`).then((r) => {
      const active = r.data.plans.filter((p) => p.isActive);
      setPlans(active);
      setPay((p) => ({ ...p, planId: active[0]?.id || '' }));
    }).catch(() => {});
  }, [load, base]);

  const record = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/members/${member.id}/dues`, pay);
      setMsg({ type: 'success', text: 'Dues recorded.' });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <Modal title={member.user.name} onClose={onClose} width={640}>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="member-detail-head">
            {data.card && <img src={data.card} alt="Member card QR" className="mini-qr" />}
            <dl className="details">
              <dt>Member no.</dt>
              <dd className="mono">{data.member.memberNumber || '—'}</dd>
              <dt>Role</dt>
              <dd>{ROLE_LABEL[data.member.role]}</dd>
              <dt>Joined</dt>
              <dd>{date(data.member.joinedAt)}</dd>
              <dt>College</dt>
              <dd>{data.member.user.college?.name || 'Guest'}</dd>
              <dt>Phone</dt>
              <dd>{data.member.user.phone || '—'}</dd>
            </dl>
          </div>

          {data.memberships.length > 0 && (
            <>
              <h4>Dues history</h4>
              <table className="table compact">
                <tbody>
                  {data.memberships.map((m) => (
                    <tr key={m.id}>
                      <td>{m.planName}</td>
                      <td>
                        {date(m.startDate)} – {date(m.endDate)}
                      </td>
                      <td>
                        <Badge status={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {data.payments.length > 0 && (
            <>
              <h4>Payments to this club</h4>
              <table className="table compact">
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.receiptNumber}</td>
                      <td>{dateTime(p.paidAt)}</td>
                      <td>{p.purpose.toLowerCase()}</td>
                      <td className="right">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {can.money && plans.length > 0 && member.status === 'ACTIVE' && (
            <form className="inline-form" onSubmit={record}>
              <h4>Record dues paid in person</h4>
              <div className="row-2">
                <select value={pay.planId} onChange={(e) => setPay({ ...pay, planId: e.target.value })} aria-label="Plan">
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price)}
                    </option>
                  ))}
                </select>
                <select value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })} aria-label="Paid by">
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                </select>
              </div>
              <button className="btn btn-primary btn-sm">Record payment</button>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
