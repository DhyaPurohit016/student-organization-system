import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errorMessage, TOKEN_KEY } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Modal from '../../components/Modal';
import FileUpload from '../../components/FileUpload';
import StatCard from '../../components/StatCard';
import { CategoryBars, IncomeExpenseChart } from '../../components/Charts';
import { date, label, money } from '../../utils/format';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'ledger', label: 'Ledger' },
];

export default function ClubFinance() {
  const { base, clubApi, can, root } = useClub();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [range, setRange] = useState({ from: params.get('from') || '', to: params.get('to') || '' });
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState(null);
  const [adding, setAdding] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const setTab = (key) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    next.delete('eventId');
    setParams(next, { replace: true });
  };

  const loadSummary = useCallback(() => {
    const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v));
    api.get(`${base}/finance/summary?${q}`).then((r) => setSummary(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [range]);
  useEffect(loadSummary, [loadSummary]);
  useEffect(() => {
    api.get(`${clubApi}/finance/options`).then((r) => setOptions(r.data)).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>Finance</h1>
          <p className="muted">What came in, what went out, and how much is left. Payments and reimbursements are recorded automatically.</p>
        </div>
        <div className="row-actions">
          <Link className="btn btn-ghost" to={`${root}/expenses`}>
            Expenses to review{summary && summary.claims.toReview.count + summary.claims.toPay.count > 0 ? ` (${summary.claims.toReview.count + summary.claims.toPay.count})` : ''}
          </Link>
          {can.money && (
            <>
          <button className="btn btn-ghost" onClick={() => setAdding('INCOME')}>
            + Money in
          </button>
          <button className="btn btn-primary" onClick={() => setAdding('EXPENSE')}>
            + Money out
          </button>
            </>
          )}
        </div>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="toolbar range-bar">
        <label className="inline-label">
          From
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="inline-label">
          To
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <SemesterPresets onPick={setRange} />
        {(range.from || range.to) && (
          <button className="link-btn" onClick={() => setRange({ from: '', to: '' })}>
            All time
          </button>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview summary={summary} />}
      {tab === 'ledger' && <Ledger range={range} options={options} onChange={loadSummary} />}

      {adding && (
        <EntryModal
          type={adding}
          options={options}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            setMsg({ type: 'success', text: 'Entry recorded.' });
            loadSummary();
            if (tab === 'ledger') setParams(new URLSearchParams(params), { replace: true });
          }}
        />
      )}
    </>
  );
}

export function SemesterPresets({ onPick }) {
  const y = new Date().getFullYear();
  const presets = [
    { label: `Jan–Jun ${y}`, from: `${y}-01-01`, to: `${y}-06-30` },
    { label: `Jul–Dec ${y}`, from: `${y}-07-01`, to: `${y}-12-31` },
    { label: `${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
  ];
  return (
    <div className="seg">
      {presets.map((p) => (
        <button key={p.label} type="button" onClick={() => onPick({ from: p.from, to: p.to })}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Overview({ summary }) {
  const { root, can } = useClub();
  if (!summary) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Money in" value={summary.totalIncome} money />
        <StatCard label="Money out" value={summary.totalExpense} money />
        <div className="stat-card">
          <div className="stat-label">Net for period</div>
          <div className={`stat-value ${summary.net < 0 ? 'danger-text' : ''}`}>{money(summary.net)}</div>
        </div>
        <div className="stat-card highlight">
          <div className="stat-label">Balance (all time)</div>
          <div className="stat-value">{money(summary.balance)}</div>
          <div className="stat-note">How much the club has now</div>
        </div>
      </div>

      {(summary.claims.toReview.count > 0 || summary.claims.toPay.count > 0) && (
        <div className="alert alert-warn section-gap">
          {summary.claims.toReview.count > 0 && `${summary.claims.toReview.count} expense(s) to review (${money(summary.claims.toReview.total)}). `}
          {summary.claims.toPay.count > 0 && `${summary.claims.toPay.count} approved expense(s) waiting to be paid (${money(summary.claims.toPay.total)}). `}
          <Link to={`${root}/expenses`}>Open Expense Management</Link>
        </div>
      )}

      <section className="card section-gap">
        <h3>Money in and out by month</h3>
        <IncomeExpenseChart data={summary.monthly} />
      </section>

      <div className="grid-2 section-gap">
        <section className="card">
          <h3>Where money came from</h3>
          <CategoryBars rows={summary.income} labelFor={(r) => label(r.category)} tone="income" />
        </section>
        <section className="card">
          <h3>Where money went</h3>
          <CategoryBars rows={summary.expense} labelFor={(r) => label(r.category)} tone="expense" />
        </section>
      </div>

      <section className="card table-card section-gap">
        <h3>Events: profit and loss</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th className="right">Tickets</th>
              <th className="right">Attended</th>
              <th className="right">Income</th>
              <th className="right">Costs</th>
              <th className="right">Profit</th>
            </tr>
          </thead>
          <tbody>
            {summary.events.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No events in this period.
                </td>
              </tr>
            )}
            {summary.events.map((e) => (
              <tr key={e.id}>
                <td>
                  {can.manage ? <Link to={`${root}/events/${e.id}`}>{e.title}</Link> : e.title}
                  <div className="muted small">
                    {date(e.startsAt)} {e.status === 'CANCELLED' && '· cancelled'}
                  </div>
                </td>
                <td className="right">{e.ticketsSold}</td>
                <td className="right">{e.checkedIn}</td>
                <td className="right">{money(e.income)}</td>
                <td className="right">{money(e.expense)}</td>
                <td className={`right ${e.profit < 0 ? 'danger-text' : ''}`}>{money(e.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Ledger({ range, options, onChange }) {
  const { base, can } = useClub();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ type: '', category: '', search: '', eventId: params.get('eventId') || '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const query = useCallback(() => {
    const q = new URLSearchParams(Object.entries({ ...range, ...filters }).filter(([, v]) => v));
    return q;
  }, [range, filters]);

  const load = useCallback(() => {
    const q = query();
    q.set('page', page);
    api.get(`${base}/finance/transactions?${q}`).then((r) => setData(r.data)).catch((err) => setError(errorMessage(err)));
  }, [query, page]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load, params]);

  // CSV comes from the server; fetch with the auth header, then save
  const exportCsv = async () => {
    const r = await fetch(`/api${base}/finance/transactions.csv?${query()}`, { headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } });
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `club-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const remove = async (e) => {
    if (!confirm(`Delete "${e.description}" (${money(e.amount)})?`)) return;
    try {
      await api.delete(`${base}/finance/transactions/${e.id}`);
      load();
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const categories = filters.type === 'INCOME' ? options?.incomeCategories : filters.type === 'EXPENSE' ? options?.expenseCategories : [...(options?.incomeCategories || []), ...(options?.expenseCategories || [])];
  const set = (k) => (e) => {
    setPage(1);
    setFilters({ ...filters, [k]: e.target.value, ...(k === 'type' ? { category: '' } : {}) });
  };

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="toolbar">
        <input className="search" placeholder="Search descriptions" value={filters.search} onChange={set('search')} />
        <select value={filters.type} onChange={set('type')} aria-label="Type">
          <option value="">In & out</option>
          <option value="INCOME">Money in</option>
          <option value="EXPENSE">Money out</option>
        </select>
        <select value={filters.category} onChange={set('category')} aria-label="Category">
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
        <select value={filters.eventId} onChange={set('eventId')} aria-label="Event">
          <option value="">Any event</option>
          {options?.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th className="right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={5} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {data?.entries.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No entries match.
                </td>
              </tr>
            )}
            {data?.entries.map((e) => (
              <tr key={e.id}>
                <td>{date(e.date)}</td>
                <td>
                  {e.description}
                  <div className="muted small">
                    {e.source === 'MANUAL' ? `Entered by ${e.recordedBy?.name || 'admin'}` : 'Automatic'}
                    {e.method && ` · ${label(e.method)}`}
                    {e.event && ` · ${e.event.title}`}
                    {e.fundraiser && ` · ${e.fundraiser.title}`}
                    {e.receiptUrl && (
                      <>
                        {' · '}
                        <a href={e.receiptUrl} target="_blank" rel="noreferrer">
                          receipt
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td>{label(e.category)}</td>
                <td className={`right amount ${e.type === 'EXPENSE' ? 'danger-text' : 'good-text'}`}>
                  {e.type === 'EXPENSE' ? '−' : '+'}
                  {money(e.amount)}
                </td>
                <td className="right">
                  {e.source === 'MANUAL' && can.money && (
                    <button className="icon-btn" onClick={() => remove(e)} aria-label={`Delete ${e.description}`}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.pages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </button>
          <span className="muted small">
            Page {data.page} of {data.pages} · {data.total} entries
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
    </>
  );
}

function EntryModal({ type, options, onClose, onSaved }) {
  const { base } = useClub();
  const manualCats = (type === 'INCOME' ? options?.incomeCategories : options?.expenseCategories)?.filter(
    (c) => !['MEMBERSHIP_DUES', 'TICKET_SALES', 'MERCHANDISE', 'REIMBURSEMENT', 'REFUND'].includes(c)
  ) || [];
  const [form, setForm] = useState({ category: manualCats[0] || '', amount: '', description: '', date: new Date().toISOString().slice(0, 10), method: 'CASH', eventId: '', fundraiserId: '', receiptUrl: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${base}/finance/transactions`, { ...form, type, amount: Number(form.amount) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal title={type === 'INCOME' ? 'Record money in' : 'Record money out'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <p className="muted small">Dues, tickets, merch, refunds and reimbursements are recorded automatically. Use this for everything else.</p>
        <label>
          Description
          <input required value={form.description} onChange={set('description')} placeholder={type === 'INCOME' ? 'e.g. Sponsorship from local cafe' : 'e.g. Decorations for the gala'} autoFocus />
        </label>
        <div className="row-2">
          <label>
            Amount (₹)
            <input type="number" min="0.01" step="0.01" required value={form.amount} onChange={set('amount')} />
          </label>
          <label>
            Date
            <input type="date" required value={form.date} onChange={set('date')} />
          </label>
        </div>
        <div className="row-2">
          <label>
            Category
            <select value={form.category} onChange={set('category')}>
              {manualCats.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Paid by
            <select value={form.method} onChange={set('method')}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </select>
          </label>
        </div>
        <div className="row-2">
          <label>
            Event (optional)
            <select value={form.eventId} onChange={set('eventId')}>
              <option value="">—</option>
              {options?.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fundraiser (optional)
            <select value={form.fundraiserId} onChange={set('fundraiserId')}>
              <option value="">—</option>
              {options?.fundraisers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <span className="field-label">Receipt (optional)</span>
          <FileUpload value={form.receiptUrl} onChange={(url) => setForm((f) => ({ ...f, receiptUrl: url }))} label="Attach receipt" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
