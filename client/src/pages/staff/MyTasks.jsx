import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import Badge from '../../components/Badge';
import { date } from '../../utils/format';
import { TASK_STATUS } from '../../utils/roles';

const today = () => new Date().toISOString().slice(0, 10);

// "My Tasks": what club managers asked me to do. Pending → In progress → Completed.
export default function MyTasks() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get('/me/tasks')
      .then((r) => setData(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const setStatus = async (task, status) => {
    try {
      await api.patch(`/tasks/${task.id}/status`, { status });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const claim = async (task) => {
    try {
      await api.post(`/tasks/${task.id}/claim`);
      load();
    } catch (err) {
      setError(errorMessage(err));
      load();
    }
  };

  if (!data) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;
  const open = data.tasks.filter((t) => t.status !== 'DONE');
  const done = data.tasks.filter((t) => t.status === 'DONE');

  return (
    <>
      <div className="page-head">
        <h1>My Tasks</h1>
        <p className="muted">Jobs your club managers gave you. Start a task when you begin and mark it completed when it's done.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {open.length === 0 && <div className="card empty-state">You have no tasks right now. 🎉</div>}
      <div className="task-grid">
        {open.map((t) => (
          <TaskCard key={t.id} task={t}>
            {t.status === 'TODO' ? (
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(t, 'IN_PROGRESS')}>
                Start Task
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(t, 'DONE')}>
                Mark Completed
              </button>
            )}
          </TaskCard>
        ))}
      </div>

      {data.openTasks.length > 0 && (
        <>
          <h2 className="section-title">Needs a volunteer</h2>
          <p className="muted small">Nobody has these yet. Pick one up if you can help.</p>
          <div className="task-grid">
            {data.openTasks.map((t) => (
              <TaskCard key={t.id} task={t}>
                <button className="btn btn-ghost btn-sm" onClick={() => claim(t)}>
                  I'll do it
                </button>
              </TaskCard>
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <details className="section-gap">
          <summary>Completed ({done.length})</summary>
          <div className="task-grid">
            {done.map((t) => (
              <TaskCard key={t.id} task={t}>
                <button className="btn btn-ghost btn-sm" onClick={() => setStatus(t, 'IN_PROGRESS')}>
                  Reopen
                </button>
              </TaskCard>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function TaskCard({ task, children }) {
  const overdue = task.status !== 'DONE' && task.dueDate && task.dueDate < today();
  const st = TASK_STATUS[task.status];
  return (
    <article className={`card task-card ${overdue ? 'overdue' : ''}`}>
      <h3>{task.title}</h3>
      <div className="muted small">
        {task.event ? task.event.title : task.fundraiser ? <Link to={`/c/${task.clubId}/fundraisers/${task.fundraiser.id}`}>{task.fundraiser.title}</Link> : task.club?.name}
        {(task.event || task.fundraiser) && ` · ${task.club?.name}`}
      </div>
      {task.description && <p className="small">{task.description}</p>}
      <dl className="task-meta">
        <dt>Due</dt>
        <dd className={overdue ? 'danger-text' : ''}>{task.dueDate ? `${date(task.dueDate)}${overdue ? ' (overdue)' : ''}` : '—'}</dd>
        <dt>Status</dt>
        <dd>
          <Badge status={task.status}>{st.label}</Badge>
        </dd>
        {task.createdBy && (
          <>
            <dt>Assigned by</dt>
            <dd>{task.createdBy.name}</dd>
          </>
        )}
      </dl>
      <div className="task-card-actions">{children}</div>
    </article>
  );
}
