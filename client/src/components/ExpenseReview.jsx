import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Badge from './Badge';
import { date, label, money } from '../utils/format';
import { EXPENSE_STATUS } from '../utils/roles';

const FILTERS = [
  { key: 'SUBMITTED', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved (to pay)' },
  { key: 'PAID', label: 'Paid' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: '', label: 'All' },
];

// Expense Management: review expenses people submitted. Pending → Approve / Reject → Mark as Paid.
// `listUrl` returns { claims, counts? }; actions go to each claim's own club, so the same list works
// for one club (club manager / treasurer) or every club in a college (College Head).
export default function ExpenseReview({ listUrl, showClub = false, onChange }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('SUBMITTED');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api
      .get(`${listUrl}${status ? `?status=${status}` : ''}`)
      .then((r) => setData(r.data))
      .catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [listUrl, status]);
  useEffect(load, [load]);

  const act = async (claim, path, body, text) => {
    try {
      await api.post(`/clubs/${claim.clubId}/manage/claims/${claim.id}/${path}`, body);
      setMsg({ type: 'success', text });
      load();
      onChange?.();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  const claims = data?.claims;
  return (
    <>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f.key} className={status === f.key ? 'on' : ''} onClick={() => setStatus(f.key)}>
            {f.label}
            {f.key && data?.counts?.[f.key] ? <span className="tab-count">{data.counts[f.key]}</span> : null}
          </button>
        ))}
      </div>
      {!claims && <p className="muted">Loading…</p>}
      {claims?.length === 0 && <div className="card empty-state">{status === 'SUBMITTED' ? 'No expenses waiting for review. 🎉' : 'Nothing here.'}</div>}
      <div className="stack">
        {claims?.map((c) => (
          <div key={c.id} className="card claim-card">
            {c.receiptUrl &&
              (c.receiptUrl.endsWith('.pdf') ? (
                <a className="claim-receipt pdf" href={c.receiptUrl} target="_blank" rel="noreferrer">
                  PDF receipt
                </a>
              ) : (
                <a className="claim-receipt" href={c.receiptUrl} target="_blank" rel="noreferrer">
                  <img src={c.receiptUrl} alt={`Receipt for ${c.title}`} />
                </a>
              ))}
            <div className="claim-main">
              <div className="row-between">
                <div>
                  <strong>{c.title}</strong> · {money(c.amount)}
                  <div className="muted small">
                    {c.claimant?.name}
                    {showClub && c.club && ` · ${c.club.name}`}
                    {c.event && ` · ${c.event.title}`}
                    {c.fundraiser && ` · ${c.fundraiser.title}`} · spent {date(c.spentOn)} · {label(c.category)}
                  </div>
                </div>
                <Badge status={c.status}>{EXPENSE_STATUS[c.status].label}</Badge>
              </div>
              {c.description && <p className="small">{c.description}</p>}
              {c.reviewedBy && (
                <p className="muted small">
                  {c.status === 'REJECTED' ? 'Rejected' : 'Approved'} by {c.reviewedBy.name}
                  {c.reviewNote && `: “${c.reviewNote}”`}
                  {c.paidAt && ` · paid ${date(c.paidAt)} by ${label(c.paidMethod)}`}
                </p>
              )}
              <div className="row-actions">
                {c.status === 'SUBMITTED' && c.claimant?.id !== user.id && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => act(c, 'review', { decision: 'APPROVED' }, 'Expense approved.')}>
                      Approve
                    </button>
                    <button
                      className="btn btn-danger-ghost btn-sm"
                      onClick={() => {
                        const note = prompt('Why are you rejecting it? (they will see this)');
                        if (note) act(c, 'review', { decision: 'REJECTED', note }, 'Expense rejected.');
                      }}
                    >
                      Reject
                    </button>
                  </>
                )}
                {c.status === 'SUBMITTED' && c.claimant?.id === user.id && <span className="muted small">Someone else must review your own expense.</span>}
                {c.status === 'APPROVED' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => confirm(`Mark ${money(c.amount)} as paid to ${c.claimant?.name} by UPI?`) && act(c, 'pay', { method: 'UPI' }, 'Marked as paid and added to the books.')}>
                      Mark as Paid (UPI)
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => confirm(`Mark ${money(c.amount)} as paid to ${c.claimant?.name} in cash?`) && act(c, 'pay', { method: 'CASH' }, 'Marked as paid and added to the books.')}>
                      Paid in cash
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
