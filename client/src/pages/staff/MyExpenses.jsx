import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import Badge from '../../components/Badge';
import FileUpload from '../../components/FileUpload';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { EXPENSE_STATUS, staffClubs } from '../../utils/roles';
import { date, label, money } from '../../utils/format';

const CATEGORIES = ['EVENT_COSTS', 'SUPPLIES', 'MERCH_STOCK', 'VENUE', 'MARKETING', 'OTHER_EXPENSE'];
const today = () => new Date().toISOString().slice(0, 10);

// "My Expenses": money I spent for a club and want back. Pending → Approved → Paid (or Rejected).
export default function MyExpenses() {
  const { ctx } = useAuth();
  const [claims, setClaims] = useState(null);
  const [clubs, setClubs] = useState(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api.get('/me/claims').then((r) => setClaims(r.data.claims)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, []);
  useEffect(load, [load]);

  // Clubs I can claim for: clubs I help run, and (for College Heads) every club in my college
  useEffect(() => {
    if (!ctx) return;
    const mine = staffClubs(ctx).map((c) => ({ id: c.id, name: c.name }));
    Promise.all((ctx.headOf || []).map((c) => api.get(`/colleges/${c.id}/manage/clubs`).then((r) => r.data.clubs.filter((x) => x.status === 'ACTIVE')).catch(() => [])))
      .then((lists) => {
        const all = [...mine, ...lists.flat().map((c) => ({ id: c.id, name: c.name }))];
        setClubs(all.filter((c, i) => all.findIndex((x) => x.id === c.id) === i));
      });
  }, [ctx]);

  const pending = claims?.filter((c) => ['SUBMITTED', 'APPROVED'].includes(c.status)) || [];
  const owed = pending.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>My Expenses</h1>
          <p className="muted">Spent your own money on a club event? Submit it with the receipt and get paid back.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!clubs?.length}>
          + Submit Expense
        </button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {clubs?.length === 0 && <div className="alert alert-info">Expenses are submitted for a club you help run. You're not a volunteer in any club yet.</div>}
      {pending.length > 0 && (
        <p className="small">
          Waiting to be paid back: <strong>{money(owed)}</strong> ({pending.length} expense{pending.length === 1 ? '' : 's'})
        </p>
      )}

      <section className="card table-card">
        {!claims && <p className="muted pad">Loading…</p>}
        {claims?.length === 0 && <p className="muted pad">No expenses yet.</p>}
        {claims?.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>What for</th>
                <th className="right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.event?.title || c.fundraiser?.title || '—'}
                    <div className="muted small">{c.club?.name}</div>
                  </td>
                  <td>
                    {c.title}
                    <div className="muted small">Spent {date(c.spentOn)}</div>
                    {c.reviewNote && <div className="small">“{c.reviewNote}”</div>}
                  </td>
                  <td className="right">{money(c.amount)}</td>
                  <td>
                    <Badge status={c.status}>{EXPENSE_STATUS[c.status].label}</Badge>
                    {c.paidAt && <div className="muted small">{date(c.paidAt)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="muted small section-gap">How it works: you submit → the club manager or treasurer approves or rejects → once approved, they pay you back and mark it Paid.</p>

      {open && (
        <SubmitExpense
          clubs={clubs}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setMsg({ type: 'success', text: "Expense submitted. You'll be notified when it's reviewed." });
            load();
          }}
        />
      )}
    </>
  );
}

function SubmitExpense({ clubs, onClose, onDone }) {
  const [clubId, setClubId] = useState(clubs[0]?.id || '');
  const [options, setOptions] = useState({ events: [], fundraisers: [] });
  const [form, setForm] = useState({ eventId: '', title: '', amount: '', spentOn: today(), category: 'EVENT_COSTS', description: '', receiptUrl: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (!clubId) return;
    api.get(`/clubs/${clubId}/finance/options`).then((r) => setOptions(r.data)).catch(() => setOptions({ events: [], fundraisers: [] }));
    setForm((f) => ({ ...f, eventId: '' }));
  }, [clubId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.receiptUrl) return setError('Please upload a photo of the receipt');
    setBusy(true);
    try {
      const [kind, id] = form.eventId.split(':');
      await api.post(`/clubs/${clubId}/claims`, {
        ...form,
        eventId: kind === 'e' ? id : undefined,
        fundraiserId: kind === 'f' ? id : undefined,
        amount: Number(form.amount),
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Submit Expense" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        {clubs.length > 1 && (
          <label>
            Club
            <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Event
          <select value={form.eventId} onChange={set('eventId')}>
            <option value="">Not for a specific event</option>
            {options.events.length > 0 && (
              <optgroup label="Events">
                {options.events.map((ev) => (
                  <option key={ev.id} value={`e:${ev.id}`}>
                    {ev.title}
                  </option>
                ))}
              </optgroup>
            )}
            {options.fundraisers.length > 0 && (
              <optgroup label="Fundraisers">
                {options.fundraisers.map((f) => (
                  <option key={f.id} value={`f:${f.id}`}>
                    {f.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          What did you spend on?
          <input required value={form.title} onChange={set('title')} placeholder="e.g. Snacks for registration volunteers" autoFocus />
        </label>
        <div className="row-2">
          <label>
            Amount (₹)
            <input type="number" min="1" step="0.01" required value={form.amount} onChange={set('amount')} />
          </label>
          <label>
            Date
            <input type="date" required value={form.spentOn} onChange={set('spentOn')} max={today()} />
          </label>
        </div>
        <label>
          Type of cost
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Receipt</span>
          <FileUpload value={form.receiptUrl} onChange={(url) => setForm((f) => ({ ...f, receiptUrl: url }))} label="Upload Receipt" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Claim'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
