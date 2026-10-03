import { Link } from 'react-router-dom';
import { useClub } from '../../context/ClubContext';
import StatCard from '../../components/StatCard';
import Badge from '../../components/Badge';
import { CategoryBars, IncomeExpenseChart, Meter } from '../../components/Charts';
import { eventWhen, label } from '../../utils/format';
import { VISIBILITY } from '../../utils/roles';

// Club overview: what needs doing, numbers, next events; money only for manager/treasurer
export default function ClubDashboard() {
  const { dashboard: d, root, can } = useClub();
  const { counts, todo, nextEvents, finance } = d;

  const todos = [
    can.manage && todo.pendingRequests > 0 && { text: `${todo.pendingRequests} join request${todo.pendingRequests === 1 ? '' : 's'} to review`, to: `${root}/members?status=PENDING` },
    can.manage && todo.ordersToHandle > 0 && { text: `${todo.ordersToHandle} order${todo.ordersToHandle === 1 ? '' : 's'} to prepare or hand over`, to: `${root}/shop/orders` },
    can.manage && todo.pendingVolunteers > 0 && { text: `${todo.pendingVolunteers} volunteer offer${todo.pendingVolunteers === 1 ? '' : 's'} to approve`, to: `${root}/volunteers` },
    can.finance && todo.claimsToReview > 0 && { text: `${todo.claimsToReview} expense${todo.claimsToReview === 1 ? '' : 's'} to review or pay`, to: `${root}/expenses` },
    can.oversee && todo.overdueTasks > 0 && { text: `${todo.overdueTasks} task${todo.overdueTasks === 1 ? ' is' : 's are'} overdue`, to: `${root}/tasks` },
  ].filter(Boolean);

  return (
    <>
      {todos.length > 0 && (
        <div className="card todo-card">
          <h3>Needs attention</h3>
          <ul>
            {todos.map((t) => (
              <li key={t.to}>
                <Link to={t.to}>{t.text} →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Upcoming Events" value={counts.upcomingEvents} to={can.oversee ? `${root}/events` : undefined} />
        <StatCard label="Volunteers" value={counts.staff} to={can.oversee ? `${root}/volunteers` : undefined} />
        <StatCard label="Participants" value={counts.participants} to={can.oversee ? `${root}/participants` : undefined} />
        <StatCard label="Pending Tasks" value={counts.pendingTasks} to={can.oversee ? `${root}/tasks` : undefined} />
        <StatCard label="Pending Expenses" value={counts.pendingExpenses} to={can.finance ? `${root}/expenses` : undefined} />
        <StatCard label="Members" value={counts.members} to={can.oversee ? `${root}/members` : undefined} />
        {finance && (
          <div className="stat-card highlight">
            <div className="stat-label">Balance</div>
            <div className="stat-value">₹{Number(finance.balance).toLocaleString('en-IN')}</div>
            <div className="stat-note">
              <Link to={`${root}/finance`}>Club finances →</Link>
            </div>
          </div>
        )}
      </div>

      {finance && (
        <div className="grid-2-1 section-gap">
          <section className="card">
            <h3>Money in and out (last 6 months)</h3>
            <IncomeExpenseChart data={finance.monthly} />
          </section>
          <section className="card">
            <h3>Income by source</h3>
            <CategoryBars rows={finance.income} labelFor={(r) => label(r.category)} tone="income" />
          </section>
        </div>
      )}

      <section className="card section-gap">
        <div className="row-between">
          <h3>Next events</h3>
          {can.oversee && (
            <Link to={`${root}/events`} className="small">
              All events →
            </Link>
          )}
        </div>
        {nextEvents.length === 0 && <p className="muted">No upcoming events.</p>}
        <ul className="next-events">
          {nextEvents.map((e) => (
            <li key={e.id}>
              {can.oversee ? (
                <Link to={`${root}/events/${e.id}`}>
                  <strong>{e.title}</strong>
                </Link>
              ) : (
                <strong>{e.title}</strong>
              )}
              <span className="muted small">
                {eventWhen(e)} · <Badge status={e.visibility}>{VISIBILITY[e.visibility].label}</Badge>
              </span>
              <Meter value={e.sold} max={e.capacity} label={`${e.title} seats sold`} />
              <span className="small">
                {e.sold}/{e.capacity}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {can.staff && !can.manage && (
        <p className="muted small section-gap">
          As club {can.money ? 'treasurer' : 'volunteer'} you can use <Link to={`${root}/fundraisers`}>Fundraisers</Link> and <Link to={`${root}/verify`}>Verify card</Link>
          {can.money && (
            <>
              , plus <Link to={`${root}/expenses`}>Expense Management</Link>, <Link to={`${root}/finance`}>Finance</Link> and <Link to={`${root}/report`}>Reports</Link>
            </>
          )}
          . Your own jobs are under <Link to="/tasks">My Tasks</Link> and <Link to="/volunteering">My Events</Link>.
        </p>
      )}
    </>
  );
}
