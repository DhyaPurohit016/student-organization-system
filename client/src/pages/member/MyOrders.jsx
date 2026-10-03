import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import Badge from '../../components/Badge';
import { dateTime, money } from '../../utils/format';

export default function MyOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/me/orders')
      .then((r) => setOrders(r.data.orders))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!orders) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>My orders</h1>
          <p className="muted">We'll notify you when an order is ready to collect.</p>
        </div>
        <Link to="/clubs" className="btn btn-ghost">
          Shop
        </Link>
      </div>
      {orders.length === 0 && <div className="card empty-state">No orders yet. <Link to="/clubs">Visit the shop</Link></div>}
      <div className="stack">
        {orders.map((o) => (
          <div key={o.id} className="card">
            <div className="row-between">
              <div>
                <strong>{o.orderNumber}</strong> · {o.club?.name}
                <div className="muted small">{dateTime(o.createdAt)}</div>
              </div>
              <Badge status={o.status} />
            </div>
            <ul className="order-items">
              {o.items.map((i) => (
                <li key={i.id}>
                  <span>
                    {i.productName} · {i.size} × {i.quantity}
                  </span>
                  <span>{money(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="row-between">
              <span className="muted small">{o.discount > 0 && `Member discount −${money(o.discount)}`}</span>
              <strong>{money(o.total)}</strong>
            </div>
            {o.status === 'PENDING_PAYMENT' && o.paymentId && (
              <Link className="btn btn-primary btn-sm" to={`/checkout/${o.paymentId}`}>
                Complete payment
              </Link>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
