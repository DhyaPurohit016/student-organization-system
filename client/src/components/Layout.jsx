import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import NotificationBell from './NotificationBell';
import { activeClubs, isPlatformAdmin, isStaffAnywhere, isVerifiedStudent, ROLE_LABEL, staffClubs } from '../utils/roles';

const ACCOUNT = { section: 'Account', items: [{ to: '/help', label: 'Help & Support' }, { to: '/profile', label: 'Profile' }] };

// Sidebar built from "my context". Each person sees only what their roles need:
//   Platform Admin → platform pages only
//   College Head   → their college's pages (+ My Expenses)
//   Club staff     → volunteer tools + the clubs they help run
//   Students/guests → events, registrations, membership
function buildMenu(ctx) {
  if (isPlatformAdmin(ctx)) {
    return [
      {
        section: 'Platform',
        items: [
          { to: '/platform', label: 'Dashboard', end: true },
          { to: '/platform/colleges', label: 'Colleges & Heads' },
          { to: '/platform/users', label: 'Users' },
          { to: '/platform/reports', label: 'Reports' },
          { to: '/platform/support', label: 'Support requests' },
          { to: '/platform/settings', label: 'Settings' },
        ],
      },
      ACCOUNT,
    ];
  }

  const groups = [];
  const heads = ctx?.headOf || [];
  for (const c of heads) {
    const r = `/college/${c.id}`;
    groups.push({
      section: `College · ${c.code}`,
      items: [
        { to: r, label: 'Dashboard', end: true },
        { to: `${r}/clubs`, label: 'Clubs' },
        { to: `${r}/managers`, label: 'Club Managers' },
        { to: `${r}/students`, label: 'Students' },
        { to: `${r}/events`, label: 'Events' },
        { to: `${r}/volunteers`, label: 'Volunteers' },
        { to: `${r}/expenses`, label: 'Expense Management' },
        { to: `${r}/reports`, label: 'Reports' },
        { to: `${r}/announcements`, label: 'Announcements' },
        { to: `${r}/support`, label: 'Support requests' },
        { to: `${r}/settings`, label: 'Settings' },
      ],
    });
  }

  const clubs = activeClubs(ctx);
  const staff = isStaffAnywhere(ctx);
  if (heads.length && !clubs.length) {
    // A College Head without club roles: just their own expenses and the public events list
    groups.push({ section: 'Me', items: [{ to: '/expenses', label: 'My Expenses' }, { to: '/events', label: 'Public events' }] });
  } else if (!ctx?.college && !(ctx?.clubs || []).length) {
    // A guest: keep it simple
    groups.push({
      section: 'Me',
      items: [
        { to: '/dashboard', label: 'Dashboard', end: true },
        { to: '/events', label: 'Public Events', end: true },
        { to: '/tickets', label: 'My Registrations' },
        { to: '/orders', label: 'My Orders' },
        { to: '/clubs', label: 'Explore clubs', end: true },
      ],
    });
  } else {
    groups.push({
      section: 'Me',
      items: [
        { to: '/dashboard', label: 'Dashboard', end: true },
        { to: '/events', label: 'Events', end: true },
        ...(isVerifiedStudent(ctx) ? [{ to: '/events/college', label: 'College events' }] : []),
        { to: '/tickets', label: 'My Registrations' },
        { to: '/membership', label: 'My Membership' },
        { to: '/orders', label: 'My Orders' },
        { to: '/announcements', label: 'Announcements' },
        { to: '/clubs', label: 'Explore clubs', end: true },
      ],
    });
  }

  if (staff) {
    groups.push({
      section: 'Volunteer',
      items: [
        { to: '/volunteering', label: 'My Events' },
        { to: '/tasks', label: 'My Tasks' },
        { to: '/helping-out', label: 'Helping Out' },
        { to: '/participants', label: 'Participants' },
        ...(ctx?.canCheckIn ? [{ to: '/checkin', label: 'Door check-in' }] : []),
        ...(heads.length ? [] : [{ to: '/expenses', label: 'My Expenses' }]),
      ],
    });
    groups.push({
      section: 'Clubs I help run',
      items: staffClubs(ctx).map((c) => ({ to: `/c/${c.id}`, label: c.name, badge: ROLE_LABEL[c.role] })),
    });
  }
  groups.push(ACCOUNT);
  return groups;
}

export default function Layout() {
  const { user, ctx, logout } = useAuth();
  const { count } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = buildMenu(ctx);

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/" className="brand">
            <span className="brand-mark">C</span>
            <div>
              <div className="brand-name">CampusClubs</div>
              <div className="brand-sub">{ctx?.college ? ctx.college.code : 'Clubs & events'}</div>
            </div>
          </Link>
          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Menu">
            ☰
          </button>
        </div>
        <nav onClick={() => setMenuOpen(false)}>
          {menu.map((group) => (
            <div key={group.section} className="nav-group">
              <div className="nav-section">{group.section}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  <span className="nav-label">{item.label}</span>
                  {item.badge && <small>{item.badge}</small>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div />
          <div className="user-box">
            <Link to="/cart" className="cart-link" aria-label={`Cart, ${count} items`}>
              🛒{count > 0 && <span className="cart-count">{count}</span>}
            </Link>
            <NotificationBell />
            <div className="user-info">
              <strong>{user.name}</strong>
              {user.role === 'PLATFORM_ADMIN' && <span className="role-badge role-admin">PLATFORM ADMIN</span>}
              {ctx?.headOf?.length > 0 && <span className="role-badge role-manager">COLLEGE HEAD</span>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Log out
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
