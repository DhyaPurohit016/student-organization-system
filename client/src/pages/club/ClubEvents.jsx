import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import FileUpload from '../../components/FileUpload';
import { eventWhen, fromLocalInput, money, toLocalInput } from '../../utils/format';
import { VISIBILITY } from '../../utils/roles';

export default function ClubEvents() {
  const { base, root, can } = useClub();
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.get(`${base}/events`).then((r) => setEvents(r.data.events)).catch((err) => setError(errorMessage(err)));
  }, [base]);
  useEffect(load, [load]);

  const now = Date.now();
  return (
    <>
      <div className="page-head row-between">
        <div>
          <h2>Events</h2>
          <p className="muted">Create events, choose who can register, and track who turns up.</p>
        </div>
        {can.manage && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            + New event
          </button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Who can register</th>
              <th>Status</th>
              <th className="right">Registered</th>
              <th className="right">Checked in</th>
              <th className="right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {!events && (
              <tr>
                <td colSpan={6} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {events?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No events yet. Create your first one.
                </td>
              </tr>
            )}
            {events?.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => navigate(`${root}/events/${e.id}`)}>
                <td>
                  <strong>{e.title}</strong>
                  <div className="muted small">
                    {eventWhen(e)} · {e.venue}
                  </div>
                </td>
                <td>
                  <Badge status={e.visibility}>{VISIBILITY[e.visibility].label}</Badge>
                </td>
                <td>
                  <Badge status={e.status} />
                  {e.status === 'PUBLISHED' && new Date(e.startsAt).getTime() < now && <span className="muted small"> past</span>}
                </td>
                <td className="right">
                  {e.sold}/{e.capacity}
                </td>
                <td className="right">{e.checkedIn}</td>
                <td className="right">{money(e.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EventModal
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={(ev) => {
            setEditing(null);
            navigate(`${root}/events/${ev.id}`);
          }}
        />
      )}
    </>
  );
}

export function EventModal({ event, onClose, onSaved }) {
  const { base } = useClub();
  const isNew = !event.id;
  const [form, setForm] = useState({
    title: event.title || '',
    description: event.description || '',
    venue: event.venue || '',
    visibility: event.visibility || 'PUBLIC',
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    registrationDeadline: toLocalInput(event.registrationDeadline),
    capacity: event.capacity ?? 100,
    guestPrice: event.guestPrice ?? 0,
    collegePrice: event.collegePrice ?? '',
    memberPrice: event.memberPrice ?? '',
    maxPerOrder: event.maxPerOrder ?? 5,
    volunteersNeeded: event.volunteersNeeded ?? 0,
    imageUrl: event.imageUrl || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const optionalNumber = (v) => (v === '' ? '' : Number(v));

  const submit = async (publish) => {
    setBusy(true);
    setError('');
    const payload = {
      ...form,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt) || '',
      registrationDeadline: fromLocalInput(form.registrationDeadline) || '',
      capacity: Number(form.capacity),
      guestPrice: Number(form.guestPrice || 0),
      collegePrice: optionalNumber(form.collegePrice),
      memberPrice: optionalNumber(form.memberPrice),
      maxPerOrder: Number(form.maxPerOrder),
      volunteersNeeded: Number(form.volunteersNeeded) || 0,
      ...(publish ? { status: 'PUBLISHED' } : {}),
    };
    try {
      const res = isNew ? await api.post(`${base}/events`, payload) : await api.patch(`${base}/events/${event.id}`, payload);
      onSaved(res.data.event);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'New event' : 'Edit event'} onClose={onClose} width={640}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Title
          <input required value={form.title} onChange={set('title')} placeholder="e.g. Hackathon 2026" autoFocus />
        </label>
        <label>
          Venue
          <input required value={form.venue} onChange={set('venue')} />
        </label>

        <fieldset className="fieldset">
          <legend>Who can register?</legend>
          <div className="visibility-options" role="radiogroup">
            {Object.entries(VISIBILITY).map(([key, v]) => (
              <label key={key} className={`vis-option ${form.visibility === key ? 'on' : ''}`}>
                <input type="radio" name="visibility" value={key} checked={form.visibility === key} onChange={set('visibility')} />
                <strong>{v.label}</strong>
                <span className="muted small">{v.help}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="row-2">
          <label>
            Starts
            <input type="datetime-local" required value={form.startsAt} onChange={set('startsAt')} />
          </label>
          <label>
            Ends (optional)
            <input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
          </label>
        </div>
        <div className="row-2">
          <label>
            Registration closes (optional)
            <input type="datetime-local" value={form.registrationDeadline} onChange={set('registrationDeadline')} />
          </label>
          <label>
            Seats
            <input type="number" min="1" required value={form.capacity} onChange={set('capacity')} />
          </label>
        </div>

        <fieldset className="fieldset">
          <legend>Prices (₹)</legend>
          <div className="row-3">
            <label>
              Club members
              <input type="number" min="0" step="0.01" value={form.memberPrice} onChange={set('memberPrice')} placeholder="Plan discount" />
            </label>
            <label>
              Same college
              <input type="number" min="0" step="0.01" value={form.collegePrice} onChange={set('collegePrice')} placeholder="= guest price" disabled={form.visibility === 'CLUB'} />
            </label>
            <label>
              Others / guests
              <input type="number" min="0" step="0.01" required value={form.guestPrice} onChange={set('guestPrice')} />
            </label>
          </div>
          <p className="muted small">
            Club members get one ticket at the member price. "Same college" means verified students of your college who aren't club members.
            {form.visibility !== 'PUBLIC' && ' Private events allow one registration per person.'}
          </p>
        </fieldset>

        {form.visibility === 'PUBLIC' && (
          <label>
            Max people per registration
            <input type="number" min="1" max="20" value={form.maxPerOrder} onChange={set('maxPerOrder')} />
          </label>
        )}
        <label>
          Volunteers needed
          <input type="number" min="0" max="500" value={form.volunteersNeeded} onChange={set('volunteersNeeded')} />
          <span className="muted small">Club volunteers see the event under Helping Out and can offer to help. 0 = not asking.</span>
        </label>
        <label>
          Description
          <textarea rows={4} value={form.description} onChange={set('description')} />
        </label>
        <div className="field">
          <span className="field-label">Poster image (optional)</span>
          <FileUpload value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} label="Upload image" accept="image/*" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-ghost" disabled={busy}>
            {isNew ? 'Save as draft' : 'Save'}
          </button>
          {(isNew || event.status === 'DRAFT') && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submit(true)}>
              {isNew ? 'Publish' : 'Save & publish'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
