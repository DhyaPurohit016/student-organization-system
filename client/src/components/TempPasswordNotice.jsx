import { useState } from 'react';

// Shows a one-time temporary password for the admin to hand to the student
export default function TempPasswordNotice({ email, password }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      /* clipboard blocked: the admin can still read it */
    }
  };

  return (
    <div className="alert alert-info">
      <strong>Temporary password for {email}</strong>
      <div className="temp-pass">
        <code>{password}</code>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <small>This is shown only once. The student can change it under Profile after logging in.</small>
    </div>
  );
}
