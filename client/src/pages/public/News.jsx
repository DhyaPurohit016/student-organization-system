import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import { dateTime } from '../../utils/format';

// Public website: everyone's announcements. Logged in: everything this person may see.
export default function News() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(user ? '/announcements/feed' : '/announcements')
      .then((r) => setItems(r.data.announcements))
      .catch((err) => setError(errorMessage(err)));
  }, [user]);

  useEffect(() => {
    if (items && location.hash) document.querySelector(location.hash)?.scrollIntoView({ block: 'start' });
  }, [items]);

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Announcements</h1>
        <p className="muted">Every club notice in one place, with the date it was posted.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!items && <p className="muted">Loading…</p>}
      {items?.length === 0 && <div className="card empty-state">No announcements yet.</div>}
      {items?.map((a) => (
        <article key={a.id} id={`a${a.id}`} className={`card news-card ${a.pinned ? 'pinned' : ''}`}>
          <div className="row-between">
            <span className="muted small">
              {a.pinned && '📌 Pinned · '}
              {dateTime(a.publishedAt)}
              {` · ${a.club?.name || a.college?.name || ''}`}
              {a.author && ` · ${a.author.name}`}
            </span>
            {a.audience !== 'PUBLIC' && <Badge status={a.audience}>{{ MEMBERS: 'Members only', STAFF: 'Club staff', COLLEGE: a.college?.code ? `${a.college.code} students` : 'College' }[a.audience]}</Badge>}
          </div>
          <h2>{a.title}</h2>
          <p className="pre-wrap">{a.body}</p>
        </article>
      ))}
    </div>
  );
}

export function Unsubscribe() {
  const { token } = useParams();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.post('/mailing-list/unsubscribe', { token });
      setMsg({ type: 'success', text: r.data.message });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };
  return (
    <div className="narrow card center">
      <h1>Unsubscribe</h1>
      {msg ? (
        <div className={`alert alert-${msg.type}`}>{msg.text}</div>
      ) : (
        <>
          <p>Stop receiving Skyline Student Association emails?</p>
          <button className="btn btn-primary" onClick={go} disabled={busy}>
            Unsubscribe
          </button>
        </>
      )}
    </div>
  );
}
