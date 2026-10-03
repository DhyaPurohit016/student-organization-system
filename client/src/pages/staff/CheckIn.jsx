import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import QrScanner from '../../components/QrScanner';
import { date, eventWhen } from '../../utils/format';

// Door check-in: pick the event, scan tickets with the camera (or type the code).
// Big green/red result so it's readable at a glance at a busy door.
export default function CheckIn() {
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState(() => sessionStorage.getItem('checkin_event') || '');
  const [camera, setCamera] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    api
      .get('/checkin/events')
      .then((r) => {
        setEvents(r.data.events);
        if (!r.data.events.some((e) => String(e.id) === eventId) && r.data.events[0]) setEventId(String(r.data.events[0].id));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = useCallback(() => {
    if (eventId) api.get(`/checkin/events/${eventId}/stats`).then((r) => setStats(r.data)).catch(() => {});
  }, [eventId]);

  useEffect(() => {
    try {
      sessionStorage.setItem('checkin_event', eventId);
    } catch {
      /* ignore */
    }
    loadStats();
  }, [eventId, loadStats]);

  const check = useCallback(
    async (value) => {
      if (!value?.trim()) return;
      setBusy(true);
      try {
        const r = await api.post('/checkin', { code: value.trim(), eventId: eventId || undefined });
        setResult(r.data);
        if (navigator.vibrate) navigator.vibrate(r.data.ok || r.data.valid ? 80 : [80, 60, 80]);
        loadStats();
      } catch (err) {
        setResult({ ok: false, message: errorMessage(err) });
      } finally {
        setBusy(false);
        setCode('');
        inputRef.current?.focus();
      }
    },
    [eventId, loadStats]
  );

  const ok = result && (result.kind === 'MEMBERSHIP' ? result.valid : result.ok);

  return (
    <>
      <div className="page-head">
        <h1>Door check-in</h1>
        <p className="muted">Scan tickets for events where you’re on the check-in team, or a club member card.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2">
        <section className="card">
          <label>
            Event
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {events?.length === 0 && <option value="">No events you can check in for in the next 30 days</option>}
              {events?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {e.club?.name} — {eventWhen(e)}
                </option>
              ))}
            </select>
          </label>

          {stats && (
            <div className="checkin-counter" aria-live="polite">
              <strong>{stats.checkedIn}</strong> of {stats.sold} ticket holders checked in
            </div>
          )}

          {camera ? (
            <>
              <QrScanner onScan={check} paused={busy} />
              <button className="btn btn-ghost btn-sm" onClick={() => setCamera(false)}>
                Stop camera
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => setCamera(true)}>
              Start camera scanner
            </button>
          )}

          <form
            className="verify-form section-gap"
            onSubmit={(e) => {
              e.preventDefault();
              check(code);
            }}
          >
            <label>
              Or type the code
              <input ref={inputRef} value={code} onChange={(e) => setCode(e.target.value)} placeholder="TKT-XXXXXX or LDCE-CODE-0001" autoComplete="off" />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              Check
            </button>
          </form>
        </section>

        <section>
          {result ? (
            <div className={`verify-result big ${ok ? 'ok' : 'bad'}`} role="status" aria-live="assertive">
              <div className="verify-icon">{ok ? '✓' : '✕'}</div>
              <div>
                {result.kind === 'MEMBERSHIP' ? (
                  <>
                    <h2>{result.valid ? 'Valid member' : 'Not a valid member'}</h2>
                    {result.reason && <p>{result.reason}</p>}
                    {result.member && (
                      <p>
                        <strong>{result.member.name}</strong>
                        <br />
                        {result.member.memberNumber}{result.member.validUntil && ` · paid until ${date(result.member.validUntil)}`}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2>{result.ok ? 'Welcome in!' : 'Do not admit'}</h2>
                    {!result.ok && <p>{result.message}</p>}
                    {result.ticket && (
                      <p>
                        <strong>{result.ticket.holderName}</strong>
                        <br />
                        {result.ticket.ticketCode} · {result.ticket.priceType === 'MEMBER' ? 'Member ticket' : 'Guest ticket'}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="card empty-state muted">Scan a ticket to see the result here.</div>
          )}
        </section>
      </div>
    </>
  );
}
