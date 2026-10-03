import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import StatCard from '../../components/StatCard';
import { Meter } from '../../components/Charts';
import { EventModal } from './ClubEvents';
import { dateTime, downloadCsv, eventWhen, money, time } from '../../utils/format';
import { REG_TYPE, VISIBILITY } from '../../utils/roles';

export default function ClubEventDetail() {
  const { base, root, can } = useClub();
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api.get(`${base}/events/${id}/report`).then((r) => setReport(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
    const q = new URLSearchParams();
    if (filter) q.set('status', filter);
    if (search) q.set('search', search);
    api.get(`${base}/events/${id}/tickets?${q}`).then((r) => setTickets(r.data.tickets)).catch(() => {});
  }, [id, filter, search]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn, success) => {
    setMsg({ type: '', text: '' });
    try {
      const r = await fn();
      setMsg({ type: 'success', text: typeof success === 'function' ? success(r.data) : success });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  if (!report) return msg.text ? <div className="alert alert-error">{msg.text}</div> : <p className="muted">Loading…</p>;
  const { event } = report;

  return (
    <>
      <Link to={`${root}/events`} className="back-link">
        ← All events
      </Link>
      <div className="page-head row-between">
        <div>
          <h2>
            {event.title} <Badge status={event.status} /> <Badge status={event.visibility}>{VISIBILITY[event.visibility].label}</Badge>
          </h2>
          <p className="muted">
            {eventWhen(event)} · {event.venue}
            {event.registrationDeadline && ` · registration closes ${dateTime(event.registrationDeadline)}`}
          </p>
        </div>
        {!can.manage && (
          <div className="row-actions">
            <Link className="btn btn-ghost" to={`${root}/participants?event=${id}`}>
              Participants
            </Link>
            <Link className="btn btn-ghost" to={`/events/${id}`}>
              Public page
            </Link>
          </div>
        )}
        {can.manage && (
        <div className="row-actions">
          <Link className="btn btn-ghost" to={`${root}/participants?event=${id}`}>
            Participants
          </Link>
          {event.status !== 'CANCELLED' && (
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {event.status === 'DRAFT' && (
            <>
              <button className="btn btn-primary" onClick={() => act(() => api.patch(`${base}/events/${id}`, { status: 'PUBLISHED' }), 'Event published. Tickets are on sale.')}>
                Publish
              </button>
              {report.sold === 0 && (
                <button
                  className="btn btn-danger-ghost"
                  onClick={async () => {
                    if (!confirm('Delete this draft event?')) return;
                    await api.delete(`${base}/events/${id}`);
                    navigate(`${root}/events`);
                  }}
                >
                  Delete
                </button>
              )}
            </>
          )}
          {event.status === 'PUBLISHED' && (
            <>
              <Link className="btn btn-ghost" to="/checkin">
                Open door scanner
              </Link>
              <Link className="btn btn-ghost" to={`/events/${id}`}>
                Public page
              </Link>
              <button
                className="btn btn-danger-ghost"
                onClick={() => {
                  if (!confirm(`Cancel "${event.title}"? All ${report.sold} paid tickets will be refunded and holders notified.`)) return;
                  act(() => api.post(`${base}/events/${id}/cancel`), (d) => `Event cancelled. ${d.refundedTickets} tickets refunded (${money(d.refundedAmount)}).`);
                }}
              >
                Cancel event
              </button>
            </>
          )}
        </div>
        )}
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Tickets sold</div>
          <div className="stat-value">
            {report.sold}
            <span className="stat-of">/{report.capacity}</span>
          </div>
          <Meter value={report.sold} max={report.capacity} label="Seats sold" />
          <div className="stat-note">
            {report.byRegistrationType.CLUB_MEMBER} club · {report.byRegistrationType.COLLEGE_STUDENT} college · {report.byRegistrationType.EXTERNAL_STUDENT} other colleges · {report.byRegistrationType.GUEST} guests ·{' '}
            {report.seatsLeft} left
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Showed up</div>
          <div className="stat-value">
            {report.checkedIn}
            <span className="stat-of">/{report.sold}</span>
          </div>
          <Meter value={report.checkedIn} max={report.sold} label="Checked in" />
          <div className="stat-note">
            {report.attendanceRate}% attendance{report.ended ? ` · ${report.notArrived} no-shows` : ` · ${report.notArrived} still to arrive`}
          </div>
        </div>
        <StatCard label="Income" value={report.income} money />
        <StatCard label="Costs & refunds" value={report.expense} money />
        <div className="stat-card">
          <div className="stat-label">Profit</div>
          <div className={`stat-value ${report.profit < 0 ? 'danger-text' : ''}`}>{money(report.profit)}</div>
          <div className="stat-note">
            <Link to={`${root}/finance?tab=ledger&eventId=${id}`}>See ledger entries</Link>
          </div>
        </div>
      </div>

      <section className="card table-card section-gap">
        <div className="table-toolbar">
          <h3>Tickets</h3>
          <div className="toolbar">
            <input className="search" placeholder="Search name, code or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter tickets">
              <option value="">All tickets</option>
              <option value="checked-in">Checked in</option>
              <option value="not-arrived">Not arrived</option>
            </select>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                downloadCsv(`${event.title}-tickets.csv`, [
                  ['Code', 'Name', 'Buyer', 'Email', 'Type', 'Price', 'Status', 'Checked in'],
                  ...tickets.map((t) => [t.ticketCode, t.holderName, t.buyer?.name, t.buyer?.email, t.priceType, t.price, t.status, t.checkedInAt ? new Date(t.checkedInAt).toLocaleString() : '']),
                ])
              }
            >
              Export CSV
            </button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Bought by</th>
              <th>Type</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No tickets{filter || search ? ' match' : ' sold yet'}.
                </td>
              </tr>
            )}
            {tickets.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.ticketCode}</td>
                <td>{t.holderName}</td>
                <td>
                  {t.buyer?.name}
                  <div className="muted small">
                    {t.buyer?.email}
                    {t.buyer?.college && ` · ${t.buyer.college.code}`}
                  </div>
                </td>
                <td>
                  {REG_TYPE[t.registrationType]} · {money(t.price)}
                </td>
                <td>
                  {t.status === 'REFUNDED' ? (
                    <Badge status="REFUNDED" />
                  ) : t.checkedInAt ? (
                    <Badge status="DONE">
                      In {time(t.checkedInAt)}
                      {t.checkedInBy && ` · ${t.checkedInBy.name}`}
                    </Badge>
                  ) : (
                    <Badge status="VALID">Not arrived</Badge>
                  )}
                </td>
                <td className="right">
                  {can.manage && t.status === 'VALID' && !t.checkedInAt && event.status !== 'CANCELLED' && (
                    <button
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() => {
                        if (!confirm(`Refund ${money(t.price)} for ticket ${t.ticketCode} (${t.holderName})?`)) return;
                        act(() => api.post(`${base}/tickets/${t.id}/refund`), 'Ticket refunded and the seat released.');
                      }}
                    >
                      Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report.recentCheckIns.length > 0 && (
        <p className="muted small section-gap">
          Latest arrivals: {report.recentCheckIns.map((t) => `${t.holderName} (${time(t.checkedInAt)})`).join(', ')}
        </p>
      )}

      {event.status !== 'CANCELLED' && <Volunteers eventId={event.id} needed={event.volunteersNeeded} />}

      {editing && <EventModal event={event} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </>
  );
}

// Who is helping at this event, their duty, and whether they may check people in at the door
function Volunteers({ eventId, needed }) {
  const { base, can } = useClub();
  const [list, setList] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ userId: '', duty: 'Registration', canCheckIn: true });
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api.get(`${base}/events/${eventId}/volunteers`).then((r) => setList(r.data.volunteers)).catch(() => {});
  }, [base, eventId]);
  useEffect(() => {
    load();
    api.get(`${base}/assignees`).then((r) => setStaff(r.data.users)).catch(() => {});
  }, [load, base]);

  const add = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.post(`${base}/events/${eventId}/volunteers`, form);
      setForm({ ...form, userId: '' });
      load();
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };
  const remove = async (userId) => {
    await api.delete(`${base}/events/${eventId}/volunteers/${userId}`);
    load();
  };
  const decide = async (v, decision, canCheckIn = false) => {
    setMsg('');
    try {
      await api.post(`${base}/events/${eventId}/volunteers/${v.userId}/decision`, { decision, canCheckIn });
      load();
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };
  const approved = list.filter((v) => v.status === 'APPROVED');
  const offers = list.filter((v) => v.status === 'PENDING');

  return (
    <section className="card section-gap">
      <div className="row-between">
        <h3>Event volunteers</h3>
        {needed > 0 && (
          <span className="small">
            Need: <strong>{needed}</strong> · Current: <strong>{approved.length}</strong>
          </span>
        )}
      </div>
      <p className="muted small">Club volunteers helping at this event. Only those with “Can check in” can use the door scanner.</p>
      {msg && <div className="alert alert-error small">{msg}</div>}
      {offers.length > 0 && (
        <div className="offer-box">
          <strong className="small">Offers to help ({offers.length})</strong>
          {offers.map((v) => (
            <div key={v.id} className="row-between offer-row">
              <span>
                {v.user.name} <span className="muted small">· wants: {v.duty}</span>
                {v.message && <div className="small">“{v.message}”</div>}
              </span>
              {can.manage && (
                <span className="row-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => decide(v, 'APPROVED')}>
                    Approve
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => decide(v, 'APPROVED', true)}>
                    Approve + check-in
                  </button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(v, 'REJECTED')}>
                    Decline
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {approved.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Duty</th>
              <th>Door check-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {approved.map((v) => (
              <tr key={v.id}>
                <td>
                  {v.user.name}
                  <div className="muted small">{v.user.phone || v.user.email}</div>
                </td>
                <td>{v.duty}</td>
                <td>{v.canCheckIn ? <Badge status="DONE">Can check in</Badge> : <span className="muted">—</span>}</td>
                <td className="right">
                  {can.manage && (
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(v.userId)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {can.manage && (
      <form className="volunteer-form" onSubmit={add}>
        <select required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} aria-label="Volunteer">
          <option value="">Choose a club volunteer…</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role.toLowerCase()})
            </option>
          ))}
        </select>
        <input value={form.duty} onChange={(e) => setForm({ ...form, duty: e.target.value })} placeholder="Duty, e.g. Registration, Food, Technical" aria-label="Duty" />
        <label className="checkbox">
          <input type="checkbox" checked={form.canCheckIn} onChange={(e) => setForm({ ...form, canCheckIn: e.target.checked })} />
          Can check in
        </label>
        <button className="btn btn-primary btn-sm">Add</button>
      </form>
      )}
    </section>
  );
}
