import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import FileUpload from '../../components/FileUpload';
import { benefitList, durationLabel, money } from '../../utils/format';

const EMPTY = {
  name: '',
  description: '',
  price: '',
  durationType: 'YEAR_END',
  durationMonths: 12,
  ticketDiscountPercent: 0,
  merchDiscountPercent: 0,
  perks: '',
  isActive: true,
};

// Club profile and the "requires dues" switch
function ClubProfile({ hasPlans }) {
  const { club, base, reload } = useClub();
  const [form, setForm] = useState({ description: club.description || '', logoUrl: club.logoUrl || '', requiresDues: club.requiresDues });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`${base}/settings`, form);
      setMsg({ type: 'success', text: 'Club settings saved.' });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={save}>
      <h3>Club profile</h3>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <p className="muted small">
        Name and code are set by your College Head ({club.name} · {club.code}).
      </p>
      <label>
        Description (shown on the club page)
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <div className="field">
        <span className="field-label">Logo</span>
        <FileUpload value={form.logoUrl} onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))} label="Upload logo" accept="image/*" />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={form.requiresDues} onChange={(e) => setForm({ ...form, requiresDues: e.target.checked })} disabled={!hasPlans && !form.requiresDues} />
        Members must pay a membership plan to count as members
      </label>
      <p className="muted small">
        {hasPlans
          ? 'When on, approved members only get member prices and club-only events after paying. Club staff never pay.'
          : 'Create an active membership plan below first.'}
      </p>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}

export default function ClubSettings() {
  const { base } = useClub();
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, plan = edit
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api
      .get(`${base}/plans`)
      .then((res) => setPlans(res.data.plans))
      .catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, []);
  useEffect(load, [load]);

  const toggle = async (plan) => {
    try {
      await api.patch(`${base}/plans/${plan.id}`, { isActive: !plan.isActive });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  const remove = async (plan) => {
    if (!confirm(`Delete the ${plan.name} plan?`)) return;
    try {
      await api.delete(`${base}/plans/${plan.id}`);
      setMsg({ type: 'success', text: 'Plan deleted.' });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <ClubProfile hasPlans={Boolean(plans?.some((p) => p.isActive))} />
      <div className="page-head row-between section-gap">
        <div>
          <h2>Membership plans</h2>
          <p className="muted">Optional paid plans: what they cost, how long they last and what they get members.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          + New plan
        </button>
      </div>

      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {!plans && <p className="muted">Loading…</p>}

      <div className="plan-grid">
        {plans?.map((p) => (
          <div key={p.id} className={`card plan-card ${p.isActive ? '' : 'inactive'}`}>
            <div className="row-between">
              <h3>{p.name}</h3>
              {!p.isActive && <Badge status="CANCELLED">Hidden</Badge>}
            </div>
            <div className="plan-price">{money(p.price)}</div>
            <div className="muted small">{durationLabel(p)}</div>
            {p.description && <p className="small">{p.description}</p>}
            <ul className="benefits">
              {benefitList(p.benefits).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="muted small">{p.activeMembers} active member{p.activeMembers === 1 ? '' : 's'}</p>
            <div className="row-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>
                Edit
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>
                {p.isActive ? 'Hide from sale' : 'Put on sale'}
              </button>
              {p.activeMembers === 0 && (
                <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(p)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <PlanModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMsg({ type: 'success', text: 'Plan saved.' });
            load();
          }}
        />
      )}
    </>
  );
}

function PlanModal({ plan, onClose, onSaved }) {
  const { base } = useClub();
  const isNew = !plan.id;
  const [form, setForm] = useState(
    isNew
      ? EMPTY
      : {
          name: plan.name,
          description: plan.description || '',
          price: plan.price,
          durationType: plan.durationType,
          durationMonths: plan.durationMonths,
          ticketDiscountPercent: plan.benefits?.ticketDiscountPercent || 0,
          merchDiscountPercent: plan.benefits?.merchDiscountPercent || 0,
          perks: (plan.benefits?.perks || []).join(', '),
          isActive: plan.isActive,
        }
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      durationType: form.durationType,
      durationMonths: Number(form.durationMonths),
      isActive: form.isActive,
      benefits: {
        ticketDiscountPercent: Number(form.ticketDiscountPercent),
        merchDiscountPercent: Number(form.merchDiscountPercent),
        perks: form.perks.split(',').map((s) => s.trim()).filter(Boolean),
      },
    };
    try {
      if (isNew) await api.post(`${base}/plans`, payload);
      else await api.patch(`${base}/plans/${plan.id}`, payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'New plan' : `Edit ${plan.name}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        {!isNew && <p className="muted small">Changes apply to new purchases. Existing members keep what they paid for.</p>}
        <div className="row-2">
          <label>
            Name
            <input required value={form.name} onChange={set('name')} />
          </label>
          <label>
            Price (₹)
            <input type="number" min="0" required value={form.price} onChange={set('price')} />
          </label>
        </div>
        <label>
          Description
          <input value={form.description} onChange={set('description')} />
        </label>
        <div className="row-2">
          <label>
            Lasts
            <select value={form.durationType} onChange={set('durationType')}>
              <option value="YEAR_END">Until 31 December</option>
              <option value="MONTHS">A number of months</option>
            </select>
          </label>
          <label>
            Months
            <input type="number" min="1" max="60" value={form.durationMonths} onChange={set('durationMonths')} disabled={form.durationType !== 'MONTHS'} />
          </label>
        </div>
        <div className="row-2">
          <label>
            Ticket discount %
            <input type="number" min="0" max="100" value={form.ticketDiscountPercent} onChange={set('ticketDiscountPercent')} />
          </label>
          <label>
            Merch discount %
            <input type="number" min="0" max="100" value={form.merchDiscountPercent} onChange={set('merchDiscountPercent')} />
          </label>
        </div>
        <label>
          Other perks (comma separated)
          <input value={form.perks} onChange={set('perks')} placeholder="Voting rights, Free entry to socials" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
