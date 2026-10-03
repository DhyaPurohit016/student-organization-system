import { Link, NavLink, Outlet } from 'react-router-dom';
import { ClubProvider, useClub } from '../../context/ClubContext';
import { ROLE_LABEL } from '../../utils/roles';

// Shell for /c/:clubId/*: club header and tabs for what my role in this club allows
function Shell() {
  const { club, can, role, overseer, loading, error, root, clubId } = useClub();
  if (loading) return <p className="muted">Loading club…</p>;
  if (error) return <div className="alert alert-error">{error}</div>;

  // Tabs follow what I can do here. College Heads see the manager pages read-only.
  const tabs = [
    { to: root, label: 'My Club', end: true, show: can.view },
    { to: `${root}/members`, label: 'Members', show: can.oversee },
    { to: `${root}/volunteers`, label: 'Volunteers', show: can.oversee },
    { to: `${root}/events`, label: 'Events', show: can.oversee },
    { to: `${root}/participants`, label: 'Participants', show: can.oversee },
    { to: `${root}/tasks`, label: 'Tasks', show: can.oversee },
    { to: `${root}/announcements`, label: 'Announcements', show: can.manage },
    { to: `${root}/shop`, label: 'Shop & orders', show: can.manage },
    { to: `${root}/fundraisers`, label: 'Fundraisers', show: can.view },
    { to: `${root}/expenses`, label: 'Expense Management', show: can.finance },
    { to: `${root}/finance`, label: 'Finance', show: can.finance },
    { to: `${root}/report`, label: 'Reports', show: can.finance },
    { to: `${root}/verify`, label: 'Verify card', show: can.staff },
    { to: `${root}/settings`, label: 'Settings', show: can.manage },
  ].filter((t) => t.show);

  return (
    <>
      <div className="club-head">
        <div className="club-head-main">
          {club.logoUrl ? <img src={club.logoUrl} alt="" className="club-logo" /> : <span className="club-logo placeholder">{club.name[0]}</span>}
          <div>
            <h1>{club.name}</h1>
            <p className="muted small">
              {overseer && !role ? 'College Head · view only (expenses and reports you can act on)' : `Your role: ${ROLE_LABEL[role] || '—'}`} ·{' '}
              <Link to={`/clubs/${clubId}`}>Public page</Link>
            </p>
          </div>
        </div>
      </div>
      <nav className="tabs club-tabs" aria-label="Club sections">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      {/* key: switching clubs remounts the page so it loads the new club's data */}
      <Outlet key={clubId} />
    </>
  );
}

export default function ClubWorkspace() {
  return (
    <ClubProvider>
      <Shell />
    </ClubProvider>
  );
}
