import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { money } from '../../utils/format';

// Loads Razorpay's checkout script once (it must come from Razorpay's own domain)
let razorpayScript;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  razorpayScript ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => {
      razorpayScript = null;
      reject(new Error('Could not load Razorpay. Check your internet connection and try again.'));
    };
    document.body.appendChild(s);
  });
  return razorpayScript;
}

// Payment page for memberships, tickets and shop orders.
// Test mode ("mock" provider): the Pay button confirms directly.
// Razorpay: the Pay button opens Razorpay Checkout; its signed result is verified by the server.
export default function Checkout() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api
      .get(`/payments/${paymentId}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, [paymentId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const confirm = async (body) => {
    setBusy('confirm');
    try {
      const res = await api.post(`/payments/${paymentId}/confirm`, body);
      setDone(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const payWithRazorpay = async () => {
    const g = data.gateway;
    const Razorpay = await loadRazorpay();
    const rzp = new Razorpay({
      key: g.key,
      order_id: g.order_id,
      amount: g.amount,
      currency: g.currency,
      name: g.name,
      description: g.description,
      prefill: g.prefill,
      notes: g.notes,
      theme: { color: '#3b5bdb' },
      // Razorpay calls this with { razorpay_payment_id, razorpay_order_id, razorpay_signature }
      handler: (response) => confirm(response),
      modal: { ondismiss: () => setBusy(''), confirm_close: true },
    });
    rzp.on('payment.failed', (r) => {
      setError(`${r.error?.description || 'Payment failed'}. You have not been charged. You can try again.`);
    });
    rzp.open();
  };

  const pay = async () => {
    setBusy('pay');
    setError('');
    try {
      if (data.gateway) await payWithRazorpay();
      else await confirm(undefined);
    } catch (err) {
      setError(errorMessage(err));
      setBusy('');
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    try {
      await api.post(`/payments/${paymentId}/cancel`);
    } finally {
      navigate(data?.item?.next || '/dashboard');
    }
  };

  if (!data) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;

  const { payment, item } = data;
  const next = item?.next || '/dashboard';
  const nextLabel = { MEMBERSHIP: 'View my membership card', TICKET: 'View my tickets', MERCH: 'View my orders' }[item?.type] || 'Continue';

  if (done || payment.status === 'PAID') {
    const p = done?.payment || payment;
    return (
      <div className="checkout card center">
        <div className="success-mark">✓</div>
        <h2>Payment successful</h2>
        <p className="muted">
          {money(p.amount)} paid · Receipt {p.receiptNumber}
        </p>
        {done?.result?.membershipNumber && (
          <p>
            Your membership number is <strong>{done.result.membershipNumber}</strong>.
          </p>
        )}
        <Link className="btn btn-primary" to={next}>
          {nextLabel}
        </Link>
      </div>
    );
  }

  if (payment.status !== 'PENDING') {
    return (
      <div className="checkout card center">
        <h2>This checkout was {payment.status.toLowerCase()}</h2>
        <p className="muted">Nothing was charged.</p>
        <Link to={next}>Go back</Link>
      </div>
    );
  }

  const left = Math.max(0, new Date(data.expiresAt).getTime() - now);
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="checkout card">
      <h2>Checkout</h2>
      {payment.provider === 'mock' && <div className="alert alert-warn small">Test mode: no real money is charged.</div>}
      {data.gateway?.testMode && (
        <div className="alert alert-warn small">Razorpay test mode: use a Razorpay test card or test UPI ID. No real money is charged.</div>
      )}
      {item?.subtitle && <p className="muted small">{item.subtitle}</p>}
      {error && <div className="alert alert-error">{error}</div>}

      {(item?.lines || [{ label: payment.purpose, amount: payment.amount }]).map((l, i) => (
        <div key={i} className="checkout-line">
          <span>{l.label}</span>
          <span>{money(l.amount)}</span>
        </div>
      ))}
      {item?.discount > 0 && (
        <div className="checkout-line muted">
          <span>Includes member discount</span>
          <span>−{money(item.discount)}</span>
        </div>
      )}
      <div className="checkout-line total">
        <span>Total</span>
        <strong>{money(payment.amount)}</strong>
      </div>

      {left > 0 ? (
        <p className="muted small center">
          Reserved for you for {mm}:{ss}
        </p>
      ) : (
        <div className="alert alert-warn small">Your reservation time is up. Paying may fail if it has been released.</div>
      )}
      <button className="btn btn-primary btn-block" onClick={pay} disabled={!!busy}>
        {busy === 'confirm' ? 'Confirming payment…' : busy === 'pay' ? (data.gateway ? 'Waiting for Razorpay…' : 'Processing…') : `Pay ${money(payment.amount)}`}
      </button>
      {data.gateway && <p className="muted small center">Secure payment by Razorpay: UPI, cards, netbanking and wallets.</p>}
      <button className="btn btn-ghost btn-block" onClick={cancel} disabled={!!busy}>
        Cancel
      </button>
    </div>
  );
}
