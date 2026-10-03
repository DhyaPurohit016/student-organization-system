import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { Meter } from '../../components/Charts';
import { eventWhen } from '../../utils/format';

const DUTIES = ['Registration', 'Attendance', 'Food', 'Technical', 'Stage setup', 'Photography', 'Crowd management', 'General'];

// "Helping Out": upcoming events in my clubs, how many helpers they still need, and offering to help.
// Volunteer → choose event → choose role → request → manager approves → event appears in My Events.
export default function HelpingOut() {
  const [events, setEvents] = useState(null);
  const [offerFor, setOfferFor] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api.get('/helping-out').then((r) => setEvents(r.data.events)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, []);
  useEffect(load, [load]);

  const withdraw = async (e) => {
    try {
      await api.delete(`/events/${e.id}/volunteer`);
      setMsg({ type: 'success', text: `Offer for ${e.title} withdrawn.` });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  const needing = events?.filter((e) => e.volunteersNeeded > 0) || [];
  const others = events?.filter((e) => e.volunteersNeeded === 0) || [];

  return (
    <>
      <div className="page-head">
        <h1>Helping Out</h1>
        <p className="muted">Events in your clubs that are looking for volunteers. Offer to help and the club manager will confirm.</p>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {!events && <p className="muted">Loading…</p>}
      {events?.length === 0 && <div className="card empty-state">No upcoming events in your clubs right now.</div>}

      {needing.length > 0 && <h2 className="section-title">Events looking for volunteers</h2>}
      <div className="task-grid">
        {needing.map((e) => (
          <EventCard key={e.id} event={e} onOffer={() => setOfferFor(e)} onWithdraw={() => withdraw(e)} />
        ))}
      </div>

      {others.length > 0 && (
        <>
          <h2 className="section-title">Other upcoming events</h2>
          <p className="muted small">The manager hasn't asked for helpers on these, but you can still offer.</p>
          <div className="task-grid">
            {others.map((e) => (
              <EventCard key={e.id} event={e} onOffer={() => setOfferFor(e)} onWithdraw={() => withdraw(e)} />
            ))}
          </div>
        </>
      )}

      {offerFor && (
        <OfferModal
          event={offerFor}
          onClose={() => setOfferFor(null)}
          onDone={() => {
            setMsg({ type: 'success', text: `Thanks! The ${offerFor.club.name} manager will confirm your place at ${offerFor.title}.` });
            setOfferFor(null);
            load();
          }}
        />
      )}
    </>
  );
}

function EventCard({ event: e, onOffer, onWithdraw }) {
  const full = e.volunteersNeeded > 0 && e.volunteersApproved >= e.volunteersNeeded;
  return (
    <article className="card task-card">
      <h3>{e.title}</h3>
      <div className="muted small">
        {e.club.name} · {eventWhen(e)} · {e.venue}
      </div>
      {e.volunteersNeeded > 0 && (
        <div className="section-gap-sm">
          <p className="small">
            Need: <strong>{e.volunteersNeeded}</strong> volunteers · Current: <strong>{Math.min(e.volunteersApproved, e.volunteersNeeded)}/{e.volunteersNeeded}</strong>
          </p>
          <Meter value={e.volunteersApproved} max={e.volunteersNeeded} label={`Volunteers: ${e.volunteersApproved}/${e.volunteersNeeded}`} />
        </div>
      )}
      <div className="task-card-actions">
        {e.myStatus === 'APPROVED' && (
          <>
            <Badge status="ACTIVE">You're helping · {e.myDuty}</Badge>
            <Link to="/volunteering" className="small">
              My Events →
            </Link>
          </>
        )}
        {e.myStatus === 'PENDING' && (
          <>
            <Badge status="PENDING">Waiting for the manager · {e.myDuty}</Badge>
            <button className="link-btn small" onClick={onWithdraw}>
              Withdraw
            </button>
          </>
        )}
        {!e.myStatus && (
          <button className={`btn btn-sm ${full ? 'btn-ghost' : 'btn-primary'}`} onClick={onOffer}>
            {full ? 'Offer to help anyway' : 'Volunteer for this Event'}
          </button>
        )}
      </div>
    </article>
  );
}

function OfferModal({ event, onClose, onDone }) {
  const [duty, setDuty] = useState('Registration');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (ev) => {
    ev.preventDefault();
    try {
      await api.post(`/events/${event.id}/volunteer`, { duty, message });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal title={`Volunteer · ${event.title}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <p className="muted small">
          {eventWhen(event)} · {event.venue}
        </p>
        <label>
          What would you like to help with?
          <select value={duty} onChange={(e) => setDuty(e.target.value)}>
            {DUTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Message to the manager (optional)
          <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I'm free the whole day" maxLength={300} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Request to help</button>
        </div>
      </form>
    </Modal>
  );
}
