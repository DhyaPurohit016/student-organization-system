import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="center-screen">
      <div className="center">
        <h1>404</h1>
        <p className="muted">This page doesn&apos;t exist.</p>
        <Link to="/">Go home</Link>
      </div>
    </div>
  );
}
