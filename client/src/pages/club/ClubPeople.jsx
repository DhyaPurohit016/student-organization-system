// Club workspace pages for running events with people: Volunteers, Tasks, Participants, Expenses
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import ExpenseReview from '../../components/ExpenseReview';
import { date, downloadCsv, eventWhen, time } from '../../utils/format';
import { REG_TYPE, ROLE_LABEL, TASK_STATUS } from '../../utils/roles';

// ---------- Volunteers ----------

export function ClubVolunteers() {
  const { base, root, can } = useClub();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const load = useCallback(() => {
    api.get(`${base}/volunteers`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [base]);
  useEffect(load, [load]);

  const decide = async (o, decision, canCheckIn = false) => {
    try {
      await api.post(`${base}/events/${o.eventId}/volunteers/${o.userId}/decision`, { decision, canCheckIn });
      setMsg({ type: 'success', text: decision === 'APPROVED' ? `${o.user.name} is helping at ${o.event.title}.` : `Offer from ${o.user.name} declined.` });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Volunteers</h2>
          <p className="muted">Club volunteers, what they're helping at, and offers to help waiting for you.</p>
        </div>
        {can.manage && (
          <Link className="btn btn-ghost" to={`${root}/members`}>
            Make someone a volunteer
          </Link>
        )}
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {!data && <p className="muted">Loading…</p>}

      {data?.offers.length > 0 && (
        <section className="card section-gap-sm">
          <h3>Offers to help ({data.offers.length})</h3>
          <div className="card table-card flat">
            <table className="table">
              <tbody>
                {data.offers.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.user.name}</strong>
                      <div className="muted small">{o.user.email}</div>
                    </td>
                    <td>
                      <Link to={`${root}/events/${o.event.id}`}>{o.event.title}</Link>
                      <div className="muted small">
                        {eventWhen(o.event)} · wants: {o.duty}
                      </div>
                      {o.message && <div className="small">“{o.message}”</div>}
                    </td>
                    <td className="right">
                      {can.manage ? (
                        <div className="row-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => decide(o, 'APPROVED')}>
                            Approve
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => decide(o, 'APPROVED', true)} title="Approve and let them scan tickets at the door">
                            Approve + door check-in
                          </button>
                          <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(o, 'REJECTED')}>
                            Decline
                          </button>
                        </div>
                      ) : (
                        <Badge status="PENDING">Waiting for manager</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <div className="card table-card section-gap">
          <table className="table">
            <thead>
              <tr>
                <th>Volunteer</th>
                <th>Role</th>
                <th>Helping at (upcoming)</th>
              </tr>
            </thead>
            <tbody>
              {data.volunteers.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty">
                    No volunteers yet. Change a member's role to Volunteer on the Members page.
                  </td>
                </tr>
              )}
              {data.volunteers.map((v) => (
                <tr key={v.memberId}>
                  <td>
                    <strong>{v.user.name}</strong>
                    <div className="muted small">
                      {v.user.email}
                      {v.user.phone && ` · ${v.user.phone}`}
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge role-${v.role.toLowerCase()}`}>{ROLE_LABEL[v.role]}</span>
                  </td>
                  <td>
                    {v.events.length === 0 && <span className="muted">—</span>}
                    {v.events.map((e) => (
                      <div key={e.id} className="small">
                        <Link to={`${root}/events/${e.id}`}>{e.title}</Link> <span className="muted">· {e.duty}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------- Task Management ----------

const EMPTY_TASK = { title: '', description: '', eventId: '', assigneeId: '', dueDate: '', priority: 'MEDIUM' };

export function ClubTasks() {
  const { base, clubApi, can } = useClub();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'OPEN';
  const [data, setData] = useState(null);
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api.get(`${base}/tasks${status !== 'OPEN' && status ? `?status=${status}` : ''}`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [base, status]);
  useEffect(load, [load]);
  useEffect(() => {
    api.get(`${base}/assignees`).then((r) => setPeople(r.data.users)).catch(() => {});
    api.get(`${clubApi}/finance/options`).then((r) => setEvents(r.data.events)).catch(() => {});
  }, [base, clubApi]);

  const update = async (t, changes, text) => {
    try {
      await api.patch(`${base}/tasks/${t.id}`, changes);
      if (text) setMsg({ type: 'success', text });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  const tasks = data?.tasks.filter((t) => status !== 'OPEN' || t.status !== 'DONE') || [];
  const open = (data?.counts?.TODO || 0) + (data?.counts?.IN_PROGRESS || 0);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Tasks</h2>
          <p className="muted">Give volunteers jobs for events, set deadlines and follow progress.</p>
        </div>
        {can.manage && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            + Create Task
          </button>
        )}
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="tabs">
        {[
          ['OPEN', `Open${open ? ` (${open})` : ''}`],
          ['TODO', 'Pending'],
          ['IN_PROGRESS', 'In progress'],
          ['DONE', 'Completed'],
          ['', 'All'],
        ].map(([k, l]) => (
          <button key={k || 'all'} className={status === k ? 'on' : ''} onClick={() => setParams(k ? { status: k } : { status: '' }, { replace: true })}>
            {l}
          </button>
        ))}
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Assigned to</th>
              <th>Due</th>
              <th>Status</th>
              {can.manage && <th />}
            </tr>
          </thead>
          <tbody>
            {data && tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No tasks here.
                </td>
              </tr>
            )}
            {tasks.map((t) => {
              const overdue = t.status !== 'DONE' && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
              return (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                    <div className="muted small">
                      {t.event?.title || t.fundraiser?.title || 'General'}
                      {t.priority === 'HIGH' && ' · high priority'}
                    </div>
                  </td>
                  <td>
                    {can.manage ? (
                      <select value={t.assigneeId || ''} onChange={(e) => update(t, { assigneeId: e.target.value || null }, 'Task reassigned.')} aria-label={`Assignee of ${t.title}`}>
                        <option value="">Unassigned (open to volunteers)</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      t.assignee?.name || <span className="muted">Unassigned</span>
                    )}
                  </td>
                  <td className={overdue ? 'danger-text' : ''}>
                    {t.dueDate ? date(t.dueDate) : '—'}
                    {overdue && <div className="small">overdue</div>}
                  </td>
                  <td>
                    {can.manage ? (
                      <select value={t.status} onChange={(e) => update(t, { status: e.target.value })} aria-label={`Status of ${t.title}`}>
                        {Object.entries(TASK_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge status={t.status}>{TASK_STATUS[t.status].label}</Badge>
                    )}
                  </td>
                  {can.manage && (
                    <td className="right">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <TaskModal
          task={editing}
          people={people}
          events={events}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg({ type: 'success', text });
            load();
          }}
        />
      )}
    </>
  );
}

function TaskModal({ task, people, events, onClose, onSaved }) {
  const { base } = useClub();
  const isNew = !task.id;
  const [form, setForm] = useState(
    isNew ? EMPTY_TASK : { title: task.title, description: task.description || '', eventId: task.eventId || '', assigneeId: task.assigneeId || '', dueDate: task.dueDate || '', priority: task.priority }
  );
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (isNew) await api.post(`${base}/tasks`, form);
      else await api.patch(`${base}/tasks/${task.id}`, form);
      onSaved(isNew ? `Task created${form.assigneeId ? ' and the volunteer notified' : ''}.` : 'Task saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const remove = async () => {
    if (!confirm(`Delete the task "${task.title}"?`)) return;
    try {
      await api.delete(`${base}/tasks/${task.id}`);
      onSaved('Task deleted.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title={isNew ? 'Create Task' : 'Edit task'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Task
          <input required value={form.title} onChange={set('title')} placeholder="e.g. Manage registration desk" autoFocus />
        </label>
        <label>
          Event
          <select value={form.eventId} onChange={set('eventId')}>
            <option value="">Not for a specific event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </label>
        <div className="row-2">
          <label>
            Assign to
            <select value={form.assigneeId} onChange={set('assigneeId')}>
              <option value="">Nobody yet (volunteers can pick it up)</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deadline
            <input type="date" value={form.dueDate} onChange={set('dueDate')} />
          </label>
        </div>
        <label>
          Details (optional)
          <textarea rows={2} value={form.description} onChange={set('description')} />
        </label>
        <label>
          Priority
          <select value={form.priority} onChange={set('priority')}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Normal</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <div className="modal-actions">
          {!isNew && (
            <button type="button" className="btn btn-danger-ghost mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">{isNew ? 'Create Task' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Participants ----------

export function ClubParticipants() {
  const { base } = useClub();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const eventId = params.get('event') || '';

  useEffect(() => {
    api
      .get(`${base}/participants${eventId ? `?eventId=${eventId}` : ''}`)
      .then((r) => setData(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, [base, eventId]);

  const q = search.trim().toLowerCase();
  const rows = data?.participants.filter((p) => !q || [p.name, p.code, p.boughtBy?.email, p.boughtBy?.name].some((v) => v && v.toLowerCase().includes(q))) || [];
  const arrived = data?.participants.filter((p) => p.checkedInAt).length || 0;
  const byType = Object.entries(
    (data?.participants || []).reduce((m, p) => ({ ...m, [p.registrationType]: (m[p.registrationType] || 0) + 1 }), {})
  );

  const exportCsv = () =>
    downloadCsv(`participants-${data.event.title.replace(/\W+/g, '-').toLowerCase()}.csv`, [
      ['Name', 'Ticket', 'Type', 'Bought by', 'Email', 'Phone', 'College', 'Arrived'],
      ...data.participants.map((p) => [p.name, p.code, REG_TYPE[p.registrationType], p.boughtBy?.name, p.boughtBy?.email, p.boughtBy?.phone, p.boughtBy?.college, p.checkedInAt ? new Date(p.checkedInAt).toLocaleString() : '']),
    ]);

  return (
    <>
      <div className="page-head">
        <h2>Participants</h2>
        <p className="muted">Everyone registered for an event, how they registered, and who has arrived.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {data?.events.length === 0 && <div className="card empty-state">No published events yet.</div>}
      {data?.event && (
        <>
          <div className="toolbar">
            <select value={data.event.id} onChange={(e) => setParams({ event: e.target.value })} aria-label="Event">
              {data.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {date(e.startsAt)}
                </option>
              ))}
            </select>
            <input className="search" placeholder="Search name, ticket or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!data.participants.length}>
              Export CSV
            </button>
          </div>
          <p className="small">
            <strong>{data.participants.length}</strong>/{data.event.capacity} registered · <strong>{arrived}</strong> arrived
            {byType.length > 0 && ' · '}
            {byType.map(([k, n]) => `${n} ${REG_TYPE[k].toLowerCase()}`).join(' · ')}
          </p>
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Ticket</th>
                  <th>Type</th>
                  <th>Bought by</th>
                  <th>Arrived</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      {data.participants.length ? 'No match.' : 'Nobody has registered yet.'}
                    </td>
                  </tr>
                )}
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td className="mono">{p.code}</td>
                    <td>{REG_TYPE[p.registrationType]}</td>
                    <td>
                      {p.boughtBy?.name}
                      <div className="muted small">
                        {p.boughtBy?.email}
                        {p.boughtBy?.college && ` · ${p.boughtBy.college}`}
                      </div>
                    </td>
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

// ---------- Expense Management ----------

export function ClubExpenses() {
  const { base, reload } = useClub();
  return (
    <>
      <div className="page-head">
        <h2>Expense Management</h2>
        <p className="muted">Money volunteers spent for the club. Approve or reject, then mark approved ones as paid once you've sent the money.</p>
      </div>
      <ExpenseReview listUrl={`${base}/claims`} onChange={reload} />
    </>
  );
}
