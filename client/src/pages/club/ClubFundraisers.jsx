import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { Meter } from '../../components/Charts';
import { date, money } from '../../utils/format';

export default function Fundraisers() {
  const { clubApi, root } = useClub();
  const { can } = useClub();
  const isAdmin = can.manage;
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.get(`${clubApi}/fundraisers`).then((r) => setList(r.data.fundraisers)).catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>Fundraisers</h1>
          <p className="muted">Who's doing what, what's left, and whether each fundraiser is on track.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            + New fundraiser
          </button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!list && <p className="muted">Loading…</p>}
      {list?.length === 0 && <div className="card empty-state">No fundraisers yet.</div>}

      <div className="fund-grid">
        {list?.map((f) => (
          <Link key={f.id} to={`${root}/fundraisers/${f.id}`} className="card fund-card">
            <div className="row-between">
              <h3>{f.title}</h3>
              <Badge status={['ACTIVE', 'PLANNING'].includes(f.status) ? f.health : f.status} />
            </div>
            <p className="muted small">
              {f.eventDate ? date(f.eventDate) : 'No date set'}
              {f.lead && ` · led by ${f.lead.name}`}
            </p>
            <div className="fund-metric">
              <span>Tasks</span>
              <span>
                {f.tasks.done}/{f.tasks.total} done
              </span>
            </div>
            <Meter value={f.tasks.done} max={f.tasks.total} label="Tasks done" />
            {f.goalAmount > 0 && (
              <>
                <div className="fund-metric">
                  <span>Raised</span>
                  <span>
                    {money(f.raised)} of {money(f.goalAmount)}
                  </span>
                </div>
                <Meter value={f.raised} max={f.goalAmount} label="Money raised" />
              </>
            )}
            {(f.tasks.overdue > 0 || f.tasks.unassigned > 0) && (
              <p className="small warn-text">
                {f.tasks.overdue > 0 && `${f.tasks.overdue} overdue`}
                {f.tasks.overdue > 0 && f.tasks.unassigned > 0 && ' · '}
                {f.tasks.unassigned > 0 && `${f.tasks.unassigned} need a volunteer`}
              </p>
            )}
          </Link>
        ))}
      </div>

      {editing && <FundraiserModal fundraiser={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

export function FundraiserModal({ fundraiser, onClose, onSaved }) {
  const { base } = useClub();
  const isNew = !fundraiser.id;
  const [form, setForm] = useState({
    title: fundraiser.title || '',
    description: fundraiser.description || '',
    eventDate: fundraiser.eventDate || '',
    goalAmount: fundraiser.goalAmount ?? '',
    status: fundraiser.status || 'PLANNING',
    leadId: fundraiser.leadId || '',
  });
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`${base}/assignees`).then((r) => setPeople(r.data.users)).catch(() => {});
  }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, goalAmount: Number(form.goalAmount || 0) };
      if (isNew) await api.post(`${base}/fundraisers`, payload);
      else await api.patch(`${base}/fundraisers/${fundraiser.id}`, payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'New fundraiser' : 'Edit fundraiser'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Name
          <input required value={form.title} onChange={set('title')} placeholder="e.g. Bake sale" autoFocus />
        </label>
        <label>
          Description
          <textarea rows={2} value={form.description} onChange={set('description')} />
        </label>
        <div className="row-2">
          <label>
            Date
            <input type="date" value={form.eventDate} onChange={set('eventDate')} />
          </label>
          <label>
            Goal (₹)
            <input type="number" min="0" value={form.goalAmount} onChange={set('goalAmount')} />
          </label>
        </div>
        <div className="row-2">
          <label>
            Status
            <select value={form.status} onChange={set('status')}>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label>
            Lead volunteer
            <select value={form.leadId} onChange={set('leadId')}>
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
