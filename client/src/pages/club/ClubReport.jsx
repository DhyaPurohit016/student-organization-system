import { useEffect, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import StatCard from '../../components/StatCard';
import { CategoryBars, IncomeExpenseChart } from '../../components/Charts';
import { SemesterPresets } from './ClubFinance';
import { date, dateTime, downloadCsv, label, money } from '../../utils/format';

// End-of-semester report for the committee: print it or download each section as CSV
export default function ClubReports() {
  const { base } = useClub();
  const [range, setRange] = useState({ from: '', to: '' });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v));
    api
      .get(`${base}/reports/semester?${q}`)
      .then((r) => {
        setReport(r.data);
        if (!range.from) setRange({ from: r.data.period.from, to: r.data.period.to });
      })
      .catch((err) => setError(errorMessage(err)));
  }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!report) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;
  const { finance, membership, events, merch, fundraisers } = report;

  return (
    <div className="report">
      <div className="page-head row-between no-print">
        <div>
          <h2>Semester report</h2>
          <p className="muted">Everything the treasurer and committee need at the end of term.</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
      <div className="toolbar range-bar no-print">
        <label className="inline-label">
          From
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="inline-label">
          To
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <SemesterPresets onPick={setRange} />
      </div>

      <header className="print-only report-title">
        <h1>{report.club.name} — Semester report</h1>
        <p>
          {date(report.period.from)} to {date(report.period.to)} · generated {dateTime(report.generatedAt)}
        </p>
      </header>

      {/* Finance */}
      <section className="report-section">
        <div className="row-between">
          <h2>Money</h2>
          <button
            className="link-btn no-print"
            onClick={() =>
              downloadCsv('finance-summary.csv', [
                ['Type', 'Category', 'Total'],
                ...finance.income.map((r) => ['Income', label(r.category), r.total]),
                ...finance.expense.map((r) => ['Expense', label(r.category), r.total]),
                [],
                ['Total income', '', finance.totalIncome],
                ['Total expenses', '', finance.totalExpense],
                ['Net', '', finance.net],
                ['Balance (all time)', '', finance.balance],
              ])
            }
          >
            Download CSV
          </button>
        </div>
        <div className="stat-grid">
          <StatCard label="Money in" value={finance.totalIncome} money />
          <StatCard label="Money out" value={finance.totalExpense} money />
          <StatCard label="Net" value={finance.net} money />
          <StatCard label="Balance now" value={finance.balance} money />
        </div>
        <div className="grid-2 section-gap">
          <div className="card">
            <h3>Came in</h3>
            <CategoryBars rows={finance.income} labelFor={(r) => label(r.category)} tone="income" />
          </div>
          <div className="card">
            <h3>Went out</h3>
            <CategoryBars rows={finance.expense} labelFor={(r) => label(r.category)} tone="expense" />
          </div>
        </div>
        <div className="card section-gap">
          <h3>By month</h3>
          <IncomeExpenseChart data={finance.monthly} />
        </div>
      </section>

      {/* Membership */}
      <section className="report-section">
        <h2>Membership</h2>
        <div className="stat-grid">
          <StatCard label="Members now" value={membership.activeMembers} />
          <StatCard label="Joined this period" value={membership.newMembers} />
          <StatCard label="Club staff" value={membership.staff} />
          <StatCard label="Dues paid" value={membership.duesSold} />
          <StatCard label="Of which renewals" value={membership.renewals} />
                    <StatCard label="Dues collected" value={membership.duesCollected} money />
        </div>
      </section>

      {/* Events */}
      <section className="report-section">
        <div className="row-between">
          <h2>Events</h2>
          <button
            className="link-btn no-print"
            onClick={() =>
              downloadCsv('events.csv', [
                ['Event', 'Date', 'Status', 'Tickets sold', 'Attended', 'Attendance %', 'Income', 'Costs', 'Profit'],
                ...events.map((e) => [e.title, date(e.startsAt), e.status, e.ticketsSold, e.checkedIn, e.attendanceRate, e.income, e.expense, e.profit]),
              ])
            }
          >
            Download CSV
          </button>
        </div>
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th className="right">Sold</th>
                <th className="right">Attended</th>
                <th className="right">Income</th>
                <th className="right">Costs</th>
                <th className="right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No events in this period.
                  </td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.title} {e.status === 'CANCELLED' && <Badge status="CANCELLED" />}
                    <div className="muted small">{date(e.startsAt)}</div>
                  </td>
                  <td className="right">
                    {e.ticketsSold}/{e.capacity}
                  </td>
                  <td className="right">
                    {e.checkedIn} ({e.attendanceRate}%)
                  </td>
                  <td className="right">{money(e.income)}</td>
                  <td className="right">{money(e.expense)}</td>
                  <td className={`right ${e.profit < 0 ? 'danger-text' : ''}`}>{money(e.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Merch */}
      <section className="report-section">
        <div className="row-between">
          <h2>Merchandise</h2>
          <button
            className="link-btn no-print"
            onClick={() =>
              downloadCsv('merchandise.csv', [['Product', 'Size', 'Sold in period', 'Stock left'], ...merch.flatMap((p) => p.sizes.map((s) => [p.name, s.size, s.sold, s.stockLeft]))])
            }
          >
            Download CSV
          </button>
        </div>
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Sold by size</th>
                <th>Left by size</th>
                <th className="right">Units</th>
                <th className="right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {merch.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    No products.
                  </td>
                </tr>
              )}
              {merch.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="small">{p.sizes.map((s) => `${s.size}: ${s.sold}`).join(' · ')}</td>
                  <td className="small">{p.sizes.map((s) => `${s.size}: ${s.stockLeft}`).join(' · ')}</td>
                  <td className="right">{p.unitsSold}</td>
                  <td className="right">{money(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Fundraisers */}
      <section className="report-section">
        <h2>Fundraisers</h2>
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Fundraiser</th>
                <th>Status</th>
                <th className="right">Tasks done</th>
                <th className="right">Raised</th>
                <th className="right">Goal</th>
              </tr>
            </thead>
            <tbody>
              {fundraisers.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    No fundraisers in this period.
                  </td>
                </tr>
              )}
              {fundraisers.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.title}
                    <div className="muted small">{f.eventDate ? date(f.eventDate) : ''}</div>
                  </td>
                  <td>
                    <Badge status={['ACTIVE', 'PLANNING'].includes(f.status) ? f.health : f.status} />
                  </td>
                  <td className="right">
                    {f.tasks.done}/{f.tasks.total}
                  </td>
                  <td className="right">{money(f.raised)}</td>
                  <td className="right">{f.goalAmount ? money(f.goalAmount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
