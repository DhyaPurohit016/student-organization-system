import { Link, NavLink, Outlet } from 'react-router-dom';
import { homeFor, useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import Layout from './Layout';

// Public website shell: top navigation, footer
export function PublicLayout() {
  const { user } = useAuth();
  const { count } = useCart();

  return (
    <div className="site">
      <header className="site-header">
        <Link to="/" className="brand site-brand">
          <span className="brand-mark">C</span>
          <span className="site-name">CampusClubs</span>
        </Link>
        <nav className="site-nav">
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/clubs">Clubs</NavLink>
          <NavLink to="/shop">Shop</NavLink>
          <NavLink to="/news">News</NavLink>
          <NavLink to="/cart" className="cart-link">
            Cart{count > 0 && <span className="cart-count">{count}</span>}
          </NavLink>
          {user ? (
            <Link className="btn btn-primary btn-sm" to={homeFor(user)}>
              My account
            </Link>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link className="btn btn-primary btn-sm" to="/register">
                Join
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} CampusClubs</span>
        <Link to="/news">Announcements</Link>
      </footer>
    </div>
  );
}

// Shared pages (events, shop, news) use the app layout when logged in, the website layout otherwise
export function SiteLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  return user ? <Layout /> : <PublicLayout />;
}
