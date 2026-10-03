import { useRef, useState } from 'react';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import { date } from '../../utils/format';

// Door / table check: type a membership number, or use a USB/phone QR scanner
// that "types" the QR value into the box. Camera scanning arrives with event check-in (Phase 3).
export default function VerifyMember() {
  const { clubApi } = useClub();
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get(`${clubApi}/verify`, { params: { code: code.trim() } });
      setResult(res.data);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Verify a member</h1>
        <p className="muted">Check that someone at the door or the stall is a paid-up member.</p>
      </div>

      <form className="card verify-form" onSubmit={onSubmit}>
        <label>
          Membership number or QR code
          <input
            ref={inputRef}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. LDCE-CODE-0001"
            autoComplete="off"
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className={`verify-result ${result.valid ? 'ok' : 'bad'}`} role="status">
          <div className="verify-icon">{result.valid ? '✓' : '✕'}</div>
          <div>
            <h2>{result.valid ? 'Valid member' : 'Not a valid member'}</h2>
            {result.reason && <p>{result.reason}</p>}
            {result.member && (
              <dl className="details">
                <dt>Name</dt>
                <dd>{result.member.name}</dd>
                {result.member.studentId && (
                  <>
                    <dt>Student ID</dt>
                    <dd>{result.member.studentId}</dd>
                  </>
                )}
                <dt>Member no.</dt>
                <dd>{result.member.memberNumber}</dd>
                <dt>Plan</dt>
                <dd>{result.member.plan}</dd>
                <dt>Valid until</dt>
                <dd>{date(result.member.endDate)}</dd>
              </dl>
            )}
          </div>
        </div>
      )}
    </>
  );
}
