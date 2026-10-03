import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { dateTime } from '../../utils/format';

const AUDIENCE_HELP = {
  PUBLIC: 'Club page + all club members + the mailing list',
  COLLEGE: 'Every verified student of our college',
  MEMBERS: 'Club members only',
  STAFF: 'Club staff only: manager, treasurer and volunteers',
};

export default function ClubAnnouncements() {
  const { base } = useClub();
  const [tab, setTab] = useState('posts');
  const [list, setList] = useState(null);
  const [subs, setSubs] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api.get(`${base}/announcements`).then((r) => setList(r.data.announcements)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
    api.get(`${base}/subscribers`).then((r) => setSubs(r.data)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const act = async (fn, text) => {
    try {
      await fn();
      setMsg({ type: 'success', text });
      load();
      setTimeout(load, 1500); // pick up the email count once the background send finishes
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>Announcements</h1>
          <p className="muted">Post once: it goes on the website, into members' notifications and (optionally) out by email.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          + New announcement
        </button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>
          Posts
        </button>
        <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
          Mailing list {subs && <span className="tab-count">{subs.active}</span>}
        </button>
      </div>

      {tab === 'posts' && (
        <div className="stack">
          {!list && <p className="muted">Loading…</p>}
          {list?.length === 0 && <div className="card empty-state">No announcements yet.</div>}
          {list?.map((a) => (
            <article key={a.id} className="card">
              <div className="row-between">
                <div>
                  <h3>
                    {a.pinned && '📌 '}
                    {a.title}
                  </h3>
                  <p className="muted small">
                    <Badge status={a.status} /> <Badge status={a.audience} />
                    {a.publishedAt ? ` Published ${dateTime(a.publishedAt)}` : ` Last edited ${dateTime(a.updatedAt)}`}
                    {a.author && ` by ${a.author.name}`}
                    {a.emailedAt && ` · emailed to ${a.emailedCount}`}
                    {a.emailRequested && !a.emailedAt && ' · sending email…'}
                  </p>
                </div>
                <div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(a)}>
                    Edit
                  </button>
                  {a.status === 'PUBLISHED' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.patch(`${base}/announcements/${a.id}`, { pinned: !a.pinned }), a.pinned ? 'Unpinned.' : 'Pinned to the top.')}>
                      {a.pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  {a.status === 'DRAFT' && (
                    <PublishButton
                      announcement={a}
                      onPublish={(sendEmail) => act(() => api.post(`${base}/announcements/${a.id}/publish`, { sendEmail }), sendEmail ? 'Published and emailing now.' : 'Published.')}
                    />
                  )}
                  <button
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() => confirm(`Delete "${a.title}"?`) && act(() => api.delete(`${base}/announcements/${a.id}`), 'Deleted.')}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="pre-wrap clamp-3">{a.body}</p>
            </article>
          ))}
        </div>
      )}

      {tab === 'list' && subs && (
        <>
          <p className="muted">
            "Everyone" announcements go to the club&apos;s <strong>{subs.members}</strong> members (if they allow emails) plus <strong>{subs.active}</strong> mailing-list
            subscribers. People join the list from the website's home page.
          </p>
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subs.subscribers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No subscribers yet.
                    </td>
                  </tr>
                )}
                {subs.subscribers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.email}</td>
                    <td>{s.name || '—'}</td>
                    <td>{dateTime(s.createdAt)}</td>
                    <td>{s.isSubscribed ? <Badge status="ACTIVE">Subscribed</Badge> : <Badge status="CANCELLED">Unsubscribed</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <AnnouncementModal
          announcement={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg({ type: 'success', text });
            load();
            setTimeout(load, 1500);
          }}
        />
      )}
    </>
  );
}

function PublishButton({ announcement, onPublish }) {
  return (
    <button
      className="btn btn-primary btn-sm"
      onClick={() => {
        const email = confirm(`Also email "${announcement.title}" to its audience?\n\nOK = publish and email · Cancel = publish without email`);
        onPublish(email);
      }}
    >
      Publish
    </button>
  );
}

function AnnouncementModal({ announcement, onClose, onSaved }) {
  const { base } = useClub();
  const isNew = !announcement.id;
  const published = announcement.status === 'PUBLISHED';
  const [form, setForm] = useState({ title: announcement.title || '', body: announcement.body || '', audience: announcement.audience || 'PUBLIC', pinned: announcement.pinned || false });
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (publish) => {
    setBusy(true);
    try {
      if (isNew) await api.post(`${base}/announcements`, { ...form, publish, sendEmail: publish && sendEmail });
      else {
        await api.patch(`${base}/announcements/${announcement.id}`, form);
        if (publish) await api.post(`${base}/announcements/${announcement.id}/publish`, { sendEmail });
      }
      onSaved(publish ? (sendEmail ? 'Published and emailing now.' : 'Published.') : 'Saved.');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'New announcement' : 'Edit announcement'} onClose={onClose} width={620}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Title
          <input required value={form.title} onChange={set('title')} placeholder="e.g. General meeting this Friday" autoFocus />
        </label>
        <label>
          Message
          <textarea rows={7} required value={form.body} onChange={set('body')} />
        </label>
        <label>
          Who should see it?
          <select value={form.audience} onChange={set('audience')} disabled={published}>
            <option value="PUBLIC">Everyone</option>
            <option value="MEMBERS">Members only</option>
            <option value="COLLEGE">Students of our college</option>
            <option value="STAFF">Club staff only</option>
          </select>
        </label>
        <p className="muted small">{AUDIENCE_HELP[form.audience]}{published && ' (can’t be changed after publishing)'}</p>
        <label className="checkbox">
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
          Pin to the top
        </label>
        {!published && (
          <label className="checkbox">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            Email it when I publish
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-ghost" disabled={busy}>
            {published ? 'Save changes' : 'Save draft'}
          </button>
          {!published && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(true)}>
              Publish now
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
