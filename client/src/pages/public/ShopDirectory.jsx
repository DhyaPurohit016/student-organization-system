import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';

export default function ShopDirectory() {
  const [clubs, setClubs] = useState(null);
  const [colleges, setColleges] = useState([]);
  const [search, setSearch] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/clubs'), api.get('/colleges')])
      .then(([clubResponse, collegeResponse]) => {
        setClubs(clubResponse.data.clubs);
        setColleges(collegeResponse.data.colleges);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const visibleClubs = (clubs || []).filter((club) => {
    const matchesCollege = !collegeId || String(club.collegeId) === collegeId;
    const matchesSearch = !search || `${club.name} ${club.description || ''} ${club.college.name}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCollege && matchesSearch;
  });

  return (
    <>
      <div className="page-head">
        <h1>Campus shop</h1>
        <p className="muted">Browse official merchandise from campus clubs. Open a club shop to choose sizes, see stock and member prices, and add items to your cart.</p>
      </div>
      <div className="shop-tools">
        <input className="search" type="search" placeholder="Search club shops" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search club shops" />
        <select value={collegeId} onChange={(e) => setCollegeId(e.target.value)} aria-label="Filter by college">
          <option value="">All colleges</option>
          {colleges.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}
        </select>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!clubs && !error && <p className="muted">Loading campus shops…</p>}
      {clubs?.length > 0 && visibleClubs.length === 0 && <div className="card empty-state">No campus shops match your search.</div>}
      <div className="shop-club-grid">
        {visibleClubs.map((club) => (
          <article key={club.id} className="card shop-club-card">
            <div className="shop-club-mark">{club.name.slice(0, 1)}</div>
            <div className="shop-club-copy">
              <p className="muted small">{club.college.name}</p>
              <h2>{club.name}</h2>
              <p className="muted small">{club.description || 'Browse apparel, accessories and club merchandise.'}</p>
            </div>
            <Link className="btn btn-primary btn-block" to={`/clubs/${club.id}/shop`}>Shop this club</Link>
          </article>
        ))}
      </div>
    </>
  );
}
