import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import Badge from '../../components/Badge';
import { eventWhen, money, time } from '../../utils/format';

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [big, setBig] = useState(null);

  useEffect(() => {
    api
      .get('/me/tickets')
      .then((r) => setTickets(r.data.tickets))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!tickets) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;

  const upcoming = tickets.filter((t) => t.upcoming);
  const past = tickets.filter((t) => !t.upcoming);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>Ticket register</h1>
          <p className="muted">Your event registrations and tickets are kept separately from your merchandise cart. Show the QR code at the door.</p>
        </div>
        <Link to="/events" className="btn btn-ghost">
          Find events
        </Link>
      </div>

      {upcoming.length === 0 && <div className="card empty-state">No upcoming tickets. <Link to="/events">Browse events</Link></div>}
      <div className="ticket-grid">
        {upcoming.map((t) => (
          <div key={t.id} className="ticket">
            <div className="ticket-info">
              <div className="muted small">{eventWhen(t.event)}</div>
              <h3>{t.event.title}</h3>
              <div className="muted small">{t.event.club?.name}</div>
              <div className="small">{t.event.venue}</div>
              <dl>
                <dt>Name</dt>
                <dd>{t.holderName}</dd>
                <dt>Code</dt>
                <dd className="mono">{t.ticketCode}</dd>
                <dt>Type</dt>
                <dd>{{ MEMBER: 'Member price', COLLEGE: 'College price', GUEST: 'Standard' }[t.priceType]} · {money(t.price)}</dd>
              </dl>
            </div>
            <button className="ticket-qr" onClick={() => setBig(t)} aria-label={`Enlarge QR code for ${t.ticketCode}`}>
              <img src={t.qr} alt={`QR code for ticket ${t.ticketCode}`} />
              <span className="muted small">Tap to enlarge</span>
            </button>
          </div>
        ))}
      </div>

      {past.length > 0 && (
        <section className="card table-card section-gap">
          <h3>Past & used tickets</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {past.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.event.title}
                    <div className="muted small">{eventWhen(t.event)}</div>
                  </td>
                  <td>{t.holderName}</td>
                  <td className="mono">{t.ticketCode}</td>
                  <td>
                    {t.status === 'REFUNDED' ? (
                      <Badge status="REFUNDED" />
                    ) : t.event.status === 'CANCELLED' ? (
                      <Badge status="CANCELLED" />
                    ) : t.checkedInAt ? (
                      <Badge status="DONE">Attended {time(t.checkedInAt)}</Badge>
                    ) : (
                      <Badge status="EXPIRED">Not used</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {big && (
        <div className="qr-fullscreen" onClick={() => setBig(null)} role="dialog" aria-label="Ticket QR code">
          <img src={big.qr} alt={`QR code for ticket ${big.ticketCode}`} />
          <strong>{big.holderName}</strong>
          <span className="mono">{big.ticketCode}</span>
          <span className="muted small">Tap anywhere to close</span>
        </div>
      )}
    </>
  );
}
