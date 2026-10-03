import { useState } from 'react';
import api, { errorMessage } from '../api/client';

// Uploads one image/PDF and returns its URL through onChange
export default function FileUpload({ value, onChange, label = 'Upload file', accept = 'image/*,application/pdf' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('File is too large (max 5 MB)');
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/uploads', form);
      onChange(res.data.url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const isPdf = value?.endsWith('.pdf');
  return (
    <div className="file-upload">
      {value && (
        <div className="file-preview">
          {isPdf ? (
            <a href={value} target="_blank" rel="noreferrer">
              View PDF
            </a>
          ) : (
            <a href={value} target="_blank" rel="noreferrer">
              <img src={value} alt="Uploaded file preview" />
            </a>
          )}
          <button type="button" className="link-btn" onClick={() => onChange('')}>
            Remove
          </button>
        </div>
      )}
      <label className="btn btn-ghost btn-sm file-btn">
        {busy ? 'Uploading…' : value ? 'Replace' : label}
        <input type="file" accept={accept} onChange={pick} disabled={busy} hidden />
      </label>
      {error && <div className="alert alert-error small">{error}</div>}
    </div>
  );
}
