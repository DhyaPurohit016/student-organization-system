import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLLEGE_STATUS } from '../utils/roles';

export default function Profile() {
  const { user, ctx, updateUser, saveSession } = useAuth();
  const [colleges, setColleges] = useState([]);
  useEffect(() => {
    api.get('/colleges').then((r) => setColleges(r.data.colleges)).catch(() => {});
  }, []);
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', studentId: user.studentId || '', emailOptIn: user.emailOptIn !== false, collegeId: user.collegeId || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState({ type: '', text: '', for: '' });
  const [busy, setBusy] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy('profile');
    try {
      updateUser((await api.patch('/auth/profile', form)).data.user);
      setMsg({ type: 'success', text: 'Profile saved.', for: 'profile' });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err), for: 'profile' });
    } finally {
      setBusy('');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword.length < 8) return setMsg({ type: 'error', text: 'New password must be at least 8 characters', for: 'pw' });
    if (pw.newPassword !== pw.confirm) return setMsg({ type: 'error', text: 'New passwords do not match', for: 'pw' });
    setBusy('pw');
    try {
      const res = await api.patch('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      saveSession(res.data);
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg({ type: 'success', text: 'Password changed.', for: 'pw' });
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err), for: 'pw' });
    } finally {
      setBusy('');
    }
  };

  const alert = (key) => msg.for === key && msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>;

  return (
    <>
      <div className="page-head">
        <h1>Profile</h1>
        <p className="muted">{user.email}</p>
      </div>
      <div className="grid-2">
        <form className="card" onSubmit={saveProfile}>
          <h3>Your details</h3>
          {alert('profile')}
          <label>
            Full name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            College
            <select value={form.collegeId} onChange={(e) => setForm({ ...form, collegeId: e.target.value })} disabled={ctx?.headOf?.length > 0}>
              <option value="">No college (guest)</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="small">
            Status: <span className={`badge tone-${COLLEGE_STATUS[user.collegeStatus].tone}`}>{COLLEGE_STATUS[user.collegeStatus].label}</span>
            {String(form.collegeId || '') !== String(user.collegeId || '') && <span className="muted"> · changing college needs approval again</span>}
          </p>
          <div className="row-2">
            <label>
              Student ID
              <input value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={form.emailOptIn} onChange={(e) => setForm({ ...form, emailOptIn: e.target.checked })} />
            Email me club announcements
          </label>
          <button className="btn btn-primary" disabled={busy === 'profile'}>
            {busy === 'profile' ? 'Saving…' : 'Save'}
          </button>
        </form>

        <form className="card" onSubmit={changePassword}>
          <h3>Change password</h3>
          {alert('pw')}
          <label>
            Current password
            <input type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </label>
          <label>
            New password
            <input type="password" required autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </label>
          <label>
            Confirm new password
            <input type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </label>
          <button className="btn btn-primary" disabled={busy === 'pw'}>
            {busy === 'pw' ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </div>
    </>
  );
}
