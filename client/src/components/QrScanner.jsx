import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Phone/laptop camera QR scanner. Calls onScan(text) once per new code,
// ignoring the same code for a couple of seconds so one ticket isn't scanned twice.
export default function QrScanner({ onScan, paused }) {
  const regionId = useRef(`qr-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const last = useRef({ text: '', at: 0 });
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  onScanRef.current = onScan;
  pausedRef.current = paused;

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId.current, { verbose: false });
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        (text) => {
          const now = Date.now();
          if (pausedRef.current) return;
          if (text === last.current.text && now - last.current.at < 2500) return;
          last.current = { text, at: now };
          onScanRef.current(text);
        },
        () => {}
      )
      .then(() => !stopped && setRunning(true))
      .catch((err) => setError(String(err?.message || err).includes('Permission') ? 'Camera permission was denied. Allow camera access, or type the code below.' : 'No camera available. Type the ticket code below instead.'));

    return () => {
      stopped = true;
      if (scanner.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, []);

  return (
    <div className="scanner">
      <div id={regionId.current} className="scanner-view" />
      {!running && !error && <p className="muted small">Starting camera…</p>}
      {error && <div className="alert alert-warn small">{error}</div>}
    </div>
  );
}
