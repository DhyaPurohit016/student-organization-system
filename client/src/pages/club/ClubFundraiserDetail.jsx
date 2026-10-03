import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { Meter } from '../../components/Charts';
import { FundraiserModal } from './ClubFundraisers';
import { date, money } from '../../utils/format';

const COLUMNS = [
  { key: 'TODO', title: 'To do' },
  { key: 'IN_PROGRESS', title: 'In progress' },
  { key: 'DONE', title: 'Done' },
];
const HEALTH_TEXT = {
  ON_TRACK: 'Nothing overdue and enough done for the time left.',
  AT_RISK: 'The day is close and a lot is still to do.',
  BEHIND: 'At least one task is past its due date.',
  COMPLETED: 'This fundraiser is finished.',
  CANCELLED: 'This fundraiser was cancelled.',
};
const today = () => new Date().toISOString().slice(0, 10);

export default function FundraiserDetail() {
  const { base, root, clubApi } = useClub();
  const { id } = useParams();
  const { user } = useAuth();
  const { can } = useClub();
  const isAdmin = can.manage;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [taskModal, setTaskModal] = useState(null);
  const [editing, setEditing] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`${clubApi}/fundraisers/${id}`).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err)));
  }, [id]);
  useEffect(load, [load]);

  const move = async (task, status) => {
    try {
      if (isAdmin) await api.patch(`${base}/tasks/${task.id}`, { status });
      else await api.patch(`/tasks/${task.id}/status`, { status });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const claim = async (task) => {
    try {
      await api.post(`/tasks/${task.id}/claim`);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!data) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;
  const { fundraiser: f, taskList, entries } = data;
  const canMove = (t) => isAdmin || t.assigneeId === user.id;

  return (
    <>
      <Link to={`${root}/fundraisers`} className="back-link">
        ← All fundraisers
      </Link>
      <div className="page-head row-between">
        <div>
          <h1>{f.title}</h1>
          <p className="muted">
            {f.eventDate ? date(f.eventDate) : 'No date set'}
            {f.lead && ` · led by ${f.lead.name}`}
          </p>
        </div>
        {isAdmin && (
          <div className="row-actions">
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="btn btn-ghost" onClick={() => setIncomeOpen(true)}>
              Record money raised
            </button>
            <button className="btn btn-primary" onClick={() => setTaskModal({})}>
              + Add task
            </button>
          </div>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {f.description && <p>{f.description}</p>}

      <div className="stat-grid">
        <div className={`stat-card health-${f.health.toLowerCase()}`}>
          <div className="stat-label">Status</div>
          <div className="stat-value small-value">
            <Badge status={f.health} />
          </div>
          <div className="stat-note">{HEALTH_TEXT[f.health]}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tasks done</div>
          <div className="stat-value">
            {f.tasks.done}/{f.tasks.total}
          </div>
          <Meter value={f.tasks.done} max={f.tasks.total} label="Tasks done" />
          <div className="stat-note">
            {f.tasks.overdue > 0 && `${f.tasks.overdue} overdue · `}
            {f.tasks.unassigned} unassigned
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Raised</div>
          <div className="stat-value">{money(f.raised)}</div>
          {f.goalAmount > 0 && <Meter value={f.raised} max={f.goalAmount} label="Money raised" />}
          <div className="stat-note">{f.goalAmount > 0 ? `${f.percentRaised}% of ${money(f.goalAmount)} goal` : 'No goal set'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Spent / net</div>
          <div className="stat-value">{money(f.net)}</div>
          <div className="stat-note">{money(f.spent)} spent</div>
        </div>
      </div>

      <div className="kanban section-gap">
        {COLUMNS.map((col) => {
          const tasks = taskList.filter((t) => t.status === col.key);
          return (
            <section key={col.key} className="kanban-col" aria-label={col.title}>
              <h3>
                {col.title} <span className="muted">{tasks.length}</span>
              </h3>
              {tasks.length === 0 && <p className="muted small">Nothing here.</p>}
              {tasks.map((t) => {
                const overdue = t.status !== 'DONE' && t.dueDate && t.dueDate < today();
                return (
                  <article key={t.id} className={`kanban-card ${overdue ? 'overdue' : ''} prio-${t.priority.toLowerCase()}`}>
                    <div className="row-between">
                      <strong>{t.title}</strong>
                      {isAdmin && (
                        <button className="link-btn small" onClick={() => setTaskModal(t)}>
                          Edit
                        </button>
                      )}
                    </div>
                    {t.description && <p className="small">{t.description}</p>}
                    <div className="muted small">
                      {t.assignee ? t.assignee.name : <em>Unassigned</em>}
                      {t.dueDate && <span className={overdue ? 'danger-text' : ''}> · {overdue ? 'overdue ' : 'due '}{date(t.dueDate)}</span>}
                      {t.priority === 'HIGH' && ' · high priority'}
                    </div>
                    <div className="kanban-actions">
                      {!t.assigneeId && !isAdmin && (
                        <button className="btn btn-primary btn-sm" onClick={() => claim(t)}>
                          I'll do it
                        </button>
                      )}
                      {canMove(t) &&
                        COLUMNS.filter((c) => c.key !== t.status).map((c) => (
                          <button key={c.key} className="btn btn-ghost btn-sm" onClick={() => move(t, c.key)}>
                            → {c.title}
                          </button>
                        ))}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      <section className="card table-card section-gap">
        <h3>Money</h3>
        {entries.length === 0 ? (
          <p className="muted pad">Nothing recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{date(e.date)}</td>
                  <td>
                    {e.description}
                    {e.recordedBy && <div className="muted small">by {e.recordedBy.name}</div>}
                  </td>
                  <td className={`right ${e.type === 'EXPENSE' ? 'danger-text' : ''}`}>
                    {e.type === 'EXPENSE' ? '−' : '+'}
                    {money(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && <FundraiserModal fundraiser={f} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {taskModal && <TaskModal fundraiserId={f.id} task={taskModal} onClose={() => setTaskModal(null)} onSaved={() => { setTaskModal(null); load(); }} />}
      {incomeOpen && <IncomeModal fundraiser={f} onClose={() => setIncomeOpen(false)} onSaved={() => { setIncomeOpen(false); load(); }} />}
    </>
  );
}

function TaskModal({ fundraiserId, task, onClose, onSaved }) {
  const { base } = useClub();
  const isNew = !task.id;
  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    assigneeId: task.assigneeId || '',
    dueDate: task.dueDate || '',
    priority: task.priority || 'MEDIUM',
    status: task.status || 'TODO',
  });
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`${base}/assignees`).then((r) => setPeople(r.data.users)).catch(() => {});
  }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (isNew) await api.post(`${base}/fundraisers/${fundraiserId}/tasks`, form);
      else await api.patch(`${base}/tasks/${task.id}`, form);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const remove = async () => {
    if (!confirm(`Delete the task "${task.title}"?`)) return;
    try {
      await api.delete(`${base}/tasks/${task.id}`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal title={isNew ? 'Add task' : 'Edit task'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Task
          <input required value={form.title} onChange={set('title')} placeholder="e.g. Buy ingredients" autoFocus />
        </label>
        <label>
          Details
          <textarea rows={2} value={form.description} onChange={set('description')} />
        </label>
        <div className="row-2">
          <label>
            Assigned to
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
            Due date
            <input type="date" value={form.dueDate} onChange={set('dueDate')} />
          </label>
        </div>
        <div className="row-2">
          <label>
            Priority
            <select value={form.priority} onChange={set('priority')}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={set('status')}>
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>
          </label>
        </div>
        <div className="modal-actions">
          {!isNew && (
            <button type="button" className="btn btn-danger-ghost mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function IncomeModal({ fundraiser, onClose, onSaved }) {
  const { base } = useClub();
  const [form, setForm] = useState({ amount: '', description: `${fundraiser.title} takings`, date: today(), method: 'CASH' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/fundraisers/${fundraiser.id}/income`, { ...form, amount: Number(form.amount) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title="Record money raised" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <p className="muted small">This goes into the club's finance ledger as fundraiser income.</p>
        <div className="row-2">
          <label>
            Amount (₹)
            <input type="number" min="1" step="0.01" required value={form.amount} onChange={set('amount')} autoFocus />
          </label>
          <label>
            Received as
            <select value={form.method} onChange={set('method')}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </select>
          </label>
        </div>
        <label>
          Description
          <input required value={form.description} onChange={set('description')} />
        </label>
        <label>
          Date
          <input type="date" value={form.date} onChange={set('date')} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
