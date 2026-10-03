import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../api/client';

const EMPTY = { name: '', email: '', studentId: '', phone: '', collegeId: '', password: '', confirm: '' };

export default function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [colleges, setColleges] = useState([]);
  useEffect(() => {
    api.get('/colleges').then((res) => setColleges(res.data.colleges)).catch(() => {});
  }, []);
  const chosen = colleges.find((c) => String(c.id) === String(form.collegeId));

  if (user) return <Navigate to={homeFor(user)} replace />;

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (form.password !== form.confirm) return setError('Passwords do not match');

    setBusy(true);
    try {
      const { confirm, ...payload } = form; // eslint-disable-line no-unused-vars
      if (!payload.collegeId) delete payload.collegeId;
      await api.post('/auth/register', payload);
      navigate('/login', { replace: true, state: { email: payload.email, registered: true } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand brand-center">
          <span className="brand-mark">C</span>
        </div>
        <h1>Join the club</h1>
        <p className="muted">Join clubs and events at your college and beyond</p>

        {error && <div className="alert alert-error">{error}</div>}

        <label>
          Full name
          <input required value={form.name} onChange={set('name')} />
        </label>
        <label>
          Email
          <input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </label>
        <label>
          Your college
          <select value={form.collegeId} onChange={set('collegeId')}>
            <option value="">I'm not a student here / guest</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {chosen?.approveStudents && <p className="muted small">{chosen.name} will confirm you're a student. Until then you can still join clubs and public events.</p>}
        <div className="row-2">
          <label>
            Student ID
            <input value={form.studentId} onChange={set('studentId')} />
          </label>
          <label>
            Phone
            <input type="tel" value={form.phone} onChange={set('phone')} />
          </label>
        </div>
        <div className="row-2">
          <label>
            Password
            <input type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} />
          </label>
          <label>
            Confirm
            <input type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </label>
        </div>

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="muted small center">
          Already a member? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
