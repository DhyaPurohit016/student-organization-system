import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import MembershipCard from '../../components/MembershipCard';
import { activeClubs } from '../../utils/roles';

// "My Membership": a card for every club I belong to, dues status, and requests still waiting
export default function MyMembership() {
  const { user, ctx } = useAuth();
  const [cards, setCards] = useState({});
  const clubs = activeClubs(ctx);
  const pending = ctx?.clubs.filter((c) => c.status === 'PENDING') || [];

  useEffect(() => {
    for (const c of activeClubs(ctx)) {
      api
        .get(`/me/clubs/${c.id}/card`)
        .then((r) => setCards((m) => ({ ...m, [c.id]: r.data })))
        .catch(() => {});
    }
  }, [ctx]);

  if (!ctx) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>My Membership</h1>
          <p className="muted">Your club cards. Show the QR code at club events and stalls to get member prices.</p>
        </div>
        <Link to="/clubs" className="btn btn-ghost">
          Explore clubs
        </Link>
      </div>

      {clubs.length === 0 && pending.length === 0 && (
        <div className="card empty-state">
          You're not a member of any club yet. <Link to="/clubs">Find a club to join</Link>
        </div>
      )}

      <div className="card-grid membership-grid">
        {clubs.map((c) => {
          const card = cards[c.id];
          return (
            <section key={c.id} className="card">
              <div className="row-between">
                <h3>
                  <Link to={`/clubs/${c.id}`}>{c.name}</Link>
                </h3>
                {c.duesRequired ? <Badge status="EXPIRED">Dues to pay</Badge> : <Badge status="ACTIVE">Member</Badge>}
              </div>
              {card ? (
                <MembershipCard name={user.name} club={c.name} collegeCode={c.college.code} role={c.role} memberNumber={card.memberNumber} paidUntil={card.membership?.endDate} qr={card.qr} />
              ) : (
                <p className="muted">Loading card…</p>
              )}
              {c.duesRequired && (
                <p className="small section-gap-sm">
                  This club needs a paid plan for member prices and club-only events. <Link to={`/clubs/${c.id}`}>Pay dues →</Link>
                </p>
              )}
            </section>
          );
        })}
      </div>

      {pending.length > 0 && (
        <section className="card section-gap">
          <h3>Waiting for approval</h3>
          <ul className="plain-list">
            {pending.map((c) => (
              <li key={c.id} className="row-between">
                <Link to={`/clubs/${c.id}`}>{c.name}</Link>
                <Badge status="PENDING">Request sent</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
