import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import { dateTime, eventWhen, money } from '../../utils/format';
import { REG_TYPE, VISIBILITY } from '../../utils/roles';

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState(null);
  const [quote, setQuote] = useState(null);
  const [qty, setQty] = useState(1);
  const [names, setNames] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/events/${id}`)
      .then((r) => setEvent(r.data.event))
      .catch((err) => setError(errorMessage(err)));
    if (user) api.get(`/events/${id}/quote`).then((r) => setQuote(r.data.quote)).catch(() => {});
  }, [id, user]);

  if (!event) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;

  const vis = VISIBILITY[event.visibility];
  const canBuy = event.status === 'PUBLISHED' && event.salesOpen && event.seatsLeft > 0;
  const maxQty = Math.min(quote?.maxPerOrder || 1, event.seatsLeft);
  const unitPrices = Array.from({ length: qty }, (_, i) => (i === 0 ? quote?.yourPrice ?? event.guestPrice : event.guestPrice));
  const total = unitPrices.reduce((a, b) => a + b, 0);

  const buy = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/events/${id}/checkout`, { quantity: qty, holderNames: names.slice(0, qty) });
      navigate(res.data.free ? '/tickets' : `/checkout/${res.data.payment.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="event-detail">
      <Link to="/events" className="back-link">
        ← All events
      </Link>
      {event.imageUrl && <img src={event.imageUrl} alt="" className="event-hero" />}
      <div className="grid-2">
        <section>
          <h1>{event.title}</h1>
          <p className="event-meta">
            <strong>{eventWhen(event)}</strong>
            <br />
            {event.venue}
            <br />
            Organised by <Link to={`/clubs/${event.club.id}`}>{event.club.name}</Link> · {event.club.college?.name}
          </p>
          <p>
            <Badge status={event.visibility}>{vis.label}</Badge> <span className="muted small">{vis.help}</span>
          </p>
          {event.status === 'CANCELLED' && <div className="alert alert-error">This event has been cancelled. Registrations have been refunded.</div>}
          {event.description && <p className="pre-wrap">{event.description}</p>}
        </section>

        <section className="card ticket-box">
          <h3>Registration</h3>
          {event.memberPrice !== null && event.memberPrice !== undefined && (
            <div className="price-row">
              <span>Club members</span>
              <strong>{event.memberPrice === 0 ? 'Free' : money(event.memberPrice)}</strong>
            </div>
          )}
          {event.visibility !== 'CLUB' && event.collegePrice !== null && event.collegePrice !== undefined && (
            <div className="price-row">
              <span>{event.club.college?.code} students</span>
              <strong>{event.collegePrice === 0 ? 'Free' : money(event.collegePrice)}</strong>
            </div>
          )}
          {event.visibility === 'PUBLIC' && (
            <div className="price-row">
              <span>Everyone else</span>
              <strong>{event.guestPrice === 0 ? 'Free' : money(event.guestPrice)}</strong>
            </div>
          )}
          <p className="muted small">
            {event.seatsLeft > 0 ? `${event.seatsLeft} of ${event.capacity} seats left` : 'Full'}
            {event.registrationDeadline && ` · closes ${dateTime(event.registrationDeadline)}`}
          </p>

          {!user ? (
            canBuy && (
              <Link className="btn btn-primary btn-block" to="/login" state={{ from: location.pathname }}>
                Log in to register
              </Link>
            )
          ) : !canBuy ? (
            event.status === 'PUBLISHED' && <p className="muted">{event.seatsLeft === 0 ? 'This event is full.' : 'Registration has closed.'}</p>
          ) : quote && !quote.allowed ? (
            <div className="alert alert-warn">{quote.reason}</div>
          ) : quote ? (
            <>
              <p className="small">
                You register as: <strong>{REG_TYPE[quote.registrationType]}</strong>
                {quote.memberTicketUsed && ' (member price already used for this event)'}
              </p>
              {maxQty > 1 && (
                <label>
                  Number of people
                  <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                    {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {qty > 1 && (
                <fieldset className="fieldset">
                  <legend>Names (optional)</legend>
                  {Array.from({ length: qty }, (_, i) => (
                    <input
                      key={i}
                      className="mb-8"
                      placeholder={i === 0 ? user.name : `Guest ${i}`}
                      value={names[i] || ''}
                      onChange={(e) => {
                        const next = [...names];
                        next[i] = e.target.value;
                        setNames(next);
                      }}
                      aria-label={`Name ${i + 1}`}
                    />
                  ))}
                  <p className="muted small">Extra people pay the “everyone else” price.</p>
                </fieldset>
              )}
              <div className="checkout-line total">
                <span>Total</span>
                <strong>{total === 0 ? 'Free' : money(total)}</strong>
              </div>
              {error && <div className="alert alert-error small">{error}</div>}
              <button className="btn btn-primary btn-block" onClick={buy} disabled={busy}>
                {busy ? 'Reserving…' : total === 0 ? 'Register for free' : `Register · ${money(total)}`}
              </button>
              {total > 0 && <p className="muted small center">Your seat is held for 15 minutes while you pay.</p>}
              {event.visibility === 'PUBLIC' && !quote.isMember && event.memberPrice !== null && (
                <p className="muted small center">
                  <Link to={`/clubs/${event.club.id}`}>Join {event.club.name}</Link> for the member price.
                </p>
              )}
            </>
          ) : (
            <p className="muted">Loading your price…</p>
          )}
        </section>
      </div>
    </div>
  );
}
