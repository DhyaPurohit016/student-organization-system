import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useClub } from '../../context/ClubContext';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import FileUpload from '../../components/FileUpload';
import { money } from '../../utils/format';

export default function ClubProducts() {
  const { base, root } = useClub();
  const [products, setProducts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = useCallback(() => {
    api.get(`${base}/products`).then((r) => setProducts(r.data.products)).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }));
  }, []);
  useEffect(load, [load]);

  const toggle = async (p) => {
    await api.patch(`${base}/products/${p.id}`, { isActive: !p.isActive });
    load();
  };
  const remove = async (p) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    try {
      await api.delete(`${base}/products/${p.id}`);
      load();
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>Merchandise</h1>
          <p className="muted">Products, sizes and how many of each are left.</p>
        </div>
        <div className="row-actions">
          <Link to={`${root}/shop/orders`} className="btn btn-ghost">
            Orders
          </Link>
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            + New product
          </button>
        </div>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {!products && <p className="muted">Loading…</p>}
      {products?.length === 0 && <div className="card empty-state">No products yet. Add your first hoodie or T-shirt.</div>}

      <div className="stack">
        {products?.map((p) => (
          <div key={p.id} className={`card product-admin ${p.isActive ? '' : 'inactive'}`}>
            {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <div className="img-placeholder">{p.name[0]}</div>}
            <div className="product-admin-main">
              <div className="row-between">
                <div>
                  <h3>
                    {p.name} {!p.isActive && <Badge status="CANCELLED">Hidden</Badge>}
                    {p.lowStock && <Badge status="EXPIRING">Low stock</Badge>}
                  </h3>
                  <p className="muted small">
                    {money(p.price)}
                    {p.memberPrice !== null ? ` · members ${money(p.memberPrice)}` : ' · members get their plan discount'} · {p.totalSold} sold · {p.totalStock} in stock
                  </p>
                </div>
                <div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>
                    Edit / restock
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>
                    {p.isActive ? 'Hide' : 'Show in shop'}
                  </button>
                  {p.totalSold === 0 && (
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(p)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <table className="table compact size-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    {p.variants.map((v) => (
                      <th key={v.id} className="right">
                        {v.size}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>In stock</td>
                    {p.variants.map((v) => (
                      <td key={v.id} className={`right ${v.stock === 0 ? 'danger-text' : v.stock <= 3 ? 'warn-text' : ''}`}>
                        {v.stock}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Sold</td>
                    {p.variants.map((v) => (
                      <td key={v.id} className="right">
                        {v.sold}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ProductModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMsg({ type: 'success', text: 'Product saved.' });
            load();
          }}
        />
      )}
    </>
  );
}

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL'].map((size) => ({ size, stock: 0 }));

function ProductModal({ product, onClose, onSaved }) {
  const { base } = useClub();
  const isNew = !product.id;
  const [form, setForm] = useState({
    name: product.name || '',
    description: product.description || '',
    price: product.price ?? '',
    memberPrice: product.memberPrice ?? '',
    imageUrl: product.imageUrl || '',
    variants: product.variants?.filter((v) => v.sortOrder < 999 || v.stock > 0).map((v) => ({ id: v.id, size: v.size, stock: v.stock })) || DEFAULT_SIZES,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setVariant = (i, k, v) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      ...form,
      price: Number(form.price),
      memberPrice: form.memberPrice === '' ? '' : Number(form.memberPrice),
      variants: form.variants.filter((v) => v.size.trim()).map((v) => ({ ...v, stock: Number(v.stock || 0) })),
    };
    try {
      if (isNew) await api.post(`${base}/products`, payload);
      else await api.patch(`${base}/products/${product.id}`, payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'New product' : `Edit ${product.name}`} onClose={onClose} width={600}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Name
          <input required value={form.name} onChange={set('name')} placeholder="e.g. Club Hoodie" autoFocus />
        </label>
        <div className="row-2">
          <label>
            Price ₹
            <input type="number" min="0" step="0.01" required value={form.price} onChange={set('price')} />
          </label>
          <label>
            Member price ₹ (optional)
            <input type="number" min="0" step="0.01" value={form.memberPrice} onChange={set('memberPrice')} placeholder="Plan discount" />
          </label>
        </div>
        <label>
          Description
          <textarea rows={2} value={form.description} onChange={set('description')} />
        </label>
        <div className="field">
          <span className="field-label">Photo</span>
          <FileUpload value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} label="Upload photo" accept="image/*" />
        </div>
        <fieldset className="fieldset">
          <legend>Sizes & stock</legend>
          {form.variants.map((v, i) => (
            <div key={v.id || i} className="variant-row">
              <input value={v.size} onChange={(e) => setVariant(i, 'size', e.target.value)} placeholder="Size" aria-label="Size" />
              <input type="number" min="0" value={v.stock} onChange={(e) => setVariant(i, 'stock', e.target.value)} aria-label={`Stock for ${v.size || 'size'}`} />
              <button type="button" className="icon-btn" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })} aria-label="Remove size">
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, variants: [...form.variants, { size: '', stock: 0 }] })}>
            + Add size
          </button>
          <p className="muted small">For items without sizes, use a single size such as “One size”.</p>
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
