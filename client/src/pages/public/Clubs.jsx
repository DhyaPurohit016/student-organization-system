import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Club directory, filterable by college
export default function Clubs() {
  const { ctx } = useAuth();
  const [params, setParams] = useSearchParams();
  const collegeId = params.get('collegeId') || '';
  const [search, setSearch] = useState('');
  const [colleges, setColleges] = useState([]);
  const [clubs, setClubs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/colleges').then((r) => setColleges(r.data.colleges)).catch(() => {});
  }, []);
  useEffect(() => {
    const q = new URLSearchParams();
    if (collegeId) q.set('collegeId', collegeId);
    if (search) q.set('search', search);
    const t = setTimeout(() => api.get(`/clubs?${q}`).then((r) => setClubs(r.data.clubs)).catch((err) => setError(errorMessage(err))), 200);
    return () => clearTimeout(t);
  }, [collegeId, search]);

  const mine = Object.fromEntries((ctx?.clubs || []).map((c) => [c.id, c]));

  return (
    <>
      <div className="page-head">
        <h1>Clubs</h1>
        <p className="muted">Find clubs at your college and beyond. Ask to join, and the club manager will approve you.</p>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search clubs" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={collegeId} onChange={(e) => setParams(e.target.value ? { collegeId: e.target.value } : {}, { replace: true })} aria-label="College">
          <option value="">All colleges</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {ctx?.college && !collegeId && (
          <button className="btn btn-ghost btn-sm" onClick={() => setParams({ collegeId: ctx.college.id })}>
            My college
          </button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!clubs && <p className="muted">Loading…</p>}
      {clubs?.length === 0 && <div className="card empty-state">No clubs found.</div>}
      <div className="club-grid">
        {clubs?.map((c) => (
          <Link key={c.id} to={`/clubs/${c.id}`} className="card club-card">
            {c.logoUrl ? <img src={c.logoUrl} alt="" className="club-logo" /> : <span className="club-logo placeholder">{c.name[0]}</span>}
            <div>
              <h3>{c.name}</h3>
              <div className="muted small">
                {c.college.name} · {c.members} member{c.members === 1 ? '' : 's'}
              </div>
              {c.description && <p className="small clamp-2">{c.description}</p>}
              {mine[c.id] && <span className={`badge tone-${mine[c.id].status === 'ACTIVE' ? 'good' : 'warn'}`}>{mine[c.id].status === 'ACTIVE' ? 'You’re in' : 'Request sent'}</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
