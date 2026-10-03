import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Badge from '../components/Badge';
import { dateTime } from '../utils/format';
import { isStaffAnywhere } from '../utils/roles';

// FAQs for each kind of user. Everyone sees the general ones plus those for their roles.
const FAQ = {
  platform: [
    ['How do I add a college?', 'Platform → Colleges & Heads → “+ New college”. Give the College Head’s email to make them head straight away (they need an account first).'],
    ['How do I change a College Head?', 'On the Colleges page, use “+ Add head” for the new person, then “remove” next to the old one.'],
    ['Someone forgot their password', 'Platform → Users → find them → “Reset password”. Give them the temporary password; they can change it under Profile.'],
    ['Why can’t I join clubs or volunteer?', 'A Platform Admin account only runs the platform. Use a separate personal account to take part in clubs.'],
  ],
  head: [
    ['How do I create a club?', 'College → Clubs → “+ New club”. Enter a name, a short code and (optionally) the club manager’s email.'],
    ['How do I assign a club manager?', 'College → Club Managers → “Appoint manager”. The person needs an account. To replace a manager, appoint the new one first, then remove the old one.'],
    ['How do I manage events?', 'Club managers create and run events. You can see every club’s events under College → Events and open any of them to view registrations.'],
    ['How do I approve expenses?', 'College → Expense Management lists expenses from all clubs. Approve or reject, then mark approved ones as paid once the money is sent.'],
    ['How do I approve new students?', 'College → Students → “Waiting for college approval” → Verify. You can switch approval off under Settings.'],
  ],
  manager: [
    ['How do I get volunteers for an event?', 'When creating or editing the event, set “Volunteers needed”. Club volunteers then see it under Helping Out and offer to help; approve them on the event page.'],
    ['How do I give someone a task?', 'Club → Tasks → “+ Create Task”. Choose the event, the volunteer and a due date. They see it in My Tasks.'],
    ['How do I make someone a volunteer?', 'Club → Members → change their role to Volunteer. Only volunteers, the treasurer and managers can be given tasks.'],
    ['Where do I see who registered?', 'Club → Participants. Pick an event to see everyone registered, their registration type and who has arrived.'],
  ],
  volunteer: [
    ['How do I sign up to help at an event?', 'Volunteer → Helping Out → “Volunteer for this Event”. Choose what you’d like to do; the club manager confirms and the event appears in My Events.'],
    ['How do I update a task?', 'My Tasks → “Start Task” when you begin, “Mark Completed” when it’s done.'],
    ['How do I get money back for something I bought?', 'My Expenses → “+ Submit Expense”. Choose the event, enter the amount and upload the receipt. You’ll be notified when it’s approved and paid.'],
  ],
  student: [
    ['How do I join a club?', 'Explore clubs → open a club → “Ask to join”. The club manager approves your request.'],
    ['Where are my tickets?', 'My Registrations shows every event you registered for, with the QR code to show at the door.'],
    ['Why can’t I register for a college event?', 'College-only events are for verified students of that college. If your status says “Waiting for college approval”, your College Head still has to verify you.'],
  ],
};

export default function Help() {
  const { ctx } = useAuth();
  const [requests, setRequests] = useState(null);
  const [form, setForm] = useState({ subject: '', message: '', to: 'COLLEGE' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/me/support').then((r) => setRequests(r.data.requests)).catch(() => setRequests([]));
  }, []);
  useEffect(load, [load]);

  if (!ctx) return <p className="muted">Loading…</p>;
  const isAdmin = ctx.isPlatformAdmin;
  const isHead = ctx.headOf.length > 0;
  const isManager = ctx.clubs.some((c) => c.can?.manage);
  const sections = isAdmin
    ? [['Platform Admin', FAQ.platform]]
    : [
        ...(isHead ? [['College Head', FAQ.head]] : []),
        ...(isManager ? [['Club Manager', FAQ.manager]] : []),
        ...(isStaffAnywhere(ctx) ? [['Volunteers', FAQ.volunteer]] : []),
        ...(!isHead ? [['Students & members', FAQ.student]] : []),
      ];
  // Who answers: my College Head, unless I have no college, I'm a head, or I choose the platform
  const canAskCollege = !isAdmin && !isHead && ctx.college;
  const recipient = canAskCollege && form.to === 'COLLEGE' ? `${ctx.college.name} (College Head)` : 'the Platform Admin';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/support', { ...form, to: canAskCollege ? form.to : 'PLATFORM' });
      setForm({ subject: '', message: '', to: 'COLLEGE' });
      setMsg({ type: 'success', text: `Sent to ${recipient}. You'll get a notification when they reply.` });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Help & Support</h1>
        <p className="muted">Answers to common questions, and a way to ask for help.</p>
      </div>
      <div className="grid-2-1">
        <section className="stack">
          {sections.map(([title, items]) => (
            <div key={title} className="card">
              <h3>{title}</h3>
              {items.map(([q, a]) => (
                <details key={q} className="faq">
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          ))}
        </section>

        <section className="stack">
          {!isAdmin && (
            <form className="card" onSubmit={submit}>
              <h3>{isHead ? 'Contact Platform Admin' : 'Ask for help'}</h3>
              {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
              {canAskCollege && (
                <label>
                  Send to
                  <select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
                    <option value="COLLEGE">{ctx.college.name} (College Head)</option>
                    <option value="PLATFORM">Platform Admin (website problems)</option>
                  </select>
                </label>
              )}
              <label>
                Subject
                <input required maxLength={150} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. My ticket QR doesn't load" />
              </label>
              <label>
                What's the problem?
                <textarea required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </label>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Sending…' : `Send to ${canAskCollege && form.to === 'COLLEGE' ? 'College Head' : 'Platform Admin'}`}
              </button>
            </form>
          )}
          {isAdmin && (
            <div className="card">
              <h3>Support requests</h3>
              <p className="muted small">Questions sent to the platform are under Platform → Support requests.</p>
            </div>
          )}

          {requests?.length > 0 && (
            <div className="card">
              <h3>My requests</h3>
              {requests.map((r) => (
                <div key={r.id} className="support-item">
                  <div className="row-between">
                    <strong>{r.subject}</strong>
                    <Badge status={r.status} />
                  </div>
                  <div className="muted small">
                    {dateTime(r.createdAt)} · to {r.college ? `${r.college.name} (College Head)` : 'Platform Admin'}
                  </div>
                  {r.reply && (
                    <p className="support-reply small">
                      <strong>{r.resolvedBy?.name || 'Reply'}:</strong> {r.reply}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
