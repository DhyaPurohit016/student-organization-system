import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { money } from '../../utils/format';
import { memberPrice } from './Shop';

export default function Cart() {
  const { user } = useAuth();
  const { items, setQty, remove, clear } = useCart();
  const navigate = useNavigate();
  const [pricing, setPricing] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Member pricing comes from the club whose items are in the cart
  const clubId = items[0]?.clubId;
  useEffect(() => {
    if (user && clubId) api.get(`/clubs/${clubId}/products`).then((r) => setPricing(r.data.pricing)).catch(() => {});
  }, [user, clubId]);

  const unit = (i) => memberPrice({ price: i.price, memberPrice: i.memberPrice }, pricing) ?? i.price;
  const subtotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
  const total = items.reduce((a, i) => a + unit(i) * i.quantity, 0);

  const placeOrder = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/orders', { items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), note });
      clear();
      navigate(res.data.payment ? `/checkout/${res.data.payment.id}` : '/orders');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Your cart</h1>
        {items[0]?.clubName && <p className="muted">From the {items[0].clubName} shop</p>}
      </div>
      {items.length === 0 ? (
        <div className="card empty-state">
          <p>Your cart is empty.</p>
          <Link className="btn btn-primary" to="/clubs">
            Find a club shop
          </Link>
        </div>
      ) : (
        <div className="card">
          {items.map((i) => (
            <div key={i.variantId} className="cart-line">
              {i.imageUrl ? <img src={i.imageUrl} alt="" /> : <div className="img-placeholder">{i.name[0]}</div>}
              <div className="cart-info">
                <strong>{i.name}</strong>
                <span className="muted small">Size {i.size}</span>
              </div>
              <div className="qty">
                <button className="btn btn-ghost btn-sm" onClick={() => setQty(i.variantId, i.quantity - 1)} aria-label={`One fewer ${i.name}`}>
                  −
                </button>
                <span aria-live="polite">{i.quantity}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setQty(i.variantId, i.quantity + 1)} aria-label={`One more ${i.name}`}>
                  +
                </button>
              </div>
              <div className="cart-price">{money(unit(i) * i.quantity)}</div>
              <button className="icon-btn" onClick={() => remove(i.variantId)} aria-label={`Remove ${i.name}`}>
                ×
              </button>
            </div>
          ))}
          {total < subtotal && (
            <div className="checkout-line">
              <span>Member discount</span>
              <span>−{money(subtotal - total)}</span>
            </div>
          )}
          <div className="checkout-line total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          {user ? (
            <>
              <label>
                Note for the club (optional)
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'll collect on Friday" maxLength={300} />
              </label>
              {error && <div className="alert alert-error small">{error}</div>}
              <button className="btn btn-primary btn-block" onClick={placeOrder} disabled={busy}>
                {busy ? 'Placing order…' : `Place order · ${money(total)}`}
              </button>
              <p className="muted small center">Items are held for 15 minutes while you pay. Collect from the club table.</p>
            </>
          ) : (
            <Link className="btn btn-primary btn-block" to="/login" state={{ from: '/cart' }}>
              Log in to order
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
