import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import { dateTime, money } from '../../utils/format';

const TABS = [
  { key: 'PAID', label: 'To prepare' },
  { key: 'READY', label: 'Ready to collect' },
  { key: 'COLLECTED', label: 'Collected' },
  { key: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: '', label: 'All' },
];

export default function ClubOrders() {
  const { base, root } = useClub();
  const [tab, setTab] = useState('PAID');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (tab) q.set('status', tab);
    if (search) q.set('search', search);
    api.get(`${base}/orders?${q}`).then((r) => setData(r.data)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, [tab, search]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn, text) => {
    try {
      await fn();
      setMsg({ type: 'success', text });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <Link to={`${root}/shop`} className="back-link">
        ← Merchandise
      </Link>
      <div className="page-head">
        <h1>Orders</h1>
        <p className="muted">Pack paid orders, mark them ready (the buyer is notified), then collected.</p>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key && data?.counts?.[t.key] ? <span className="tab-count">{data.counts[t.key]}</span> : null}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search order number, name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!data && <p className="muted">Loading…</p>}
      {data?.orders.length === 0 && <div className="card empty-state">No orders here.</div>}
      <div className="stack">
        {data?.orders.map((o) => (
          <div key={o.id} className="card order-card">
            <div className="row-between">
              <div>
                <strong>{o.orderNumber}</strong> · {o.user?.name}
                <div className="muted small">
                  {o.user?.email}
                  {o.user?.phone && ` · ${o.user.phone}`} · {dateTime(o.createdAt)}
                </div>
              </div>
              <Badge status={o.status} />
            </div>
            <ul className="order-items">
              {o.items.map((i) => (
                <li key={i.id}>
                  <span>
                    <strong>{i.quantity} ×</strong> {i.productName} — <strong>{i.size}</strong>
                  </span>
                  <span>{money(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {o.note && <p className="small">Note: “{o.note}”</p>}
            <div className="row-between">
              <span>
                <strong>{money(o.total)}</strong>
                {o.discount > 0 && <span className="muted small"> (member discount {money(o.discount)})</span>}
              </span>
              <div className="row-actions">
                {o.status === 'PAID' && (
                  <button className="btn btn-primary btn-sm" onClick={() => act(() => api.patch(`${base}/orders/${o.id}`, { status: 'READY' }), `${o.orderNumber} marked ready. ${o.user?.name} has been notified.`)}>
                    Mark ready
                  </button>
                )}
                {o.status === 'READY' && (
                  <button className="btn btn-primary btn-sm" onClick={() => act(() => api.patch(`${base}/orders/${o.id}`, { status: 'COLLECTED' }), `${o.orderNumber} collected.`)}>
                    Mark collected
                  </button>
                )}
                {['PAID', 'READY'].includes(o.status) && (
                  <button
                    className="btn btn-danger-ghost btn-sm"
                    onClick={() => {
                      if (!confirm(`Refund ${money(o.total)} for ${o.orderNumber}? Items go back into stock.`)) return;
                      act(() => api.post(`${base}/orders/${o.id}/refund`), `${o.orderNumber} refunded.`);
                    }}
                  >
                    Refund
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
