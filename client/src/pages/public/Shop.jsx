import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { money } from '../../utils/format';

// One club's shop (/clubs/:clubId/shop). Member prices for that club's members.
export default function Shop() {
  const { clubId } = useParams();
  const { user } = useAuth();
  const [club, setClub] = useState(null);
  const [products, setProducts] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/clubs/${clubId}`).then((r) => setClub(r.data.club)).catch((err) => setError(errorMessage(err)));
    api
      .get(`/clubs/${clubId}/products`)
      .then((r) => {
        setProducts(r.data.products);
        setPricing(r.data.pricing);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [clubId, user]);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>{club ? `${club.name} shop` : 'Club shop'}</h1>
          <p className="muted">
            {pricing?.isMember ? 'Member prices are shown.' : 'Club members get member prices.'} Order online, collect from the club.
            {club && (
              <>
                {' '}
                <Link to={`/clubs/${club.id}`}>About the club</Link>
              </>
            )}
          </p>
        </div>
        <Link to="/cart" className="btn btn-ghost">
          View cart
        </Link>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!products && !error && <p className="muted">Loading…</p>}
      {products?.length === 0 && <div className="card empty-state">No merchandise for sale right now.</div>}
      <div className="product-grid">
        {club &&
          products?.map((p) => (
            <ProductCard key={p.id} product={p} pricing={pricing} club={club} />
          ))}
      </div>
    </>
  );
}

export function memberPrice(product, pricing) {
  if (!pricing?.isMember) return null;
  if (product.memberPrice !== null && product.memberPrice !== undefined) return product.memberPrice;
  return Math.round(product.price * (1 - pricing.merchDiscountPercent / 100) * 100) / 100;
}

function ProductCard({ product, pricing, club }) {
  const { add } = useCart();
  const firstInStock = product.variants.find((v) => v.stock > 0);
  const [variantId, setVariantId] = useState(firstInStock?.id || '');
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((v) => v.id === Number(variantId));
  const mp = memberPrice(product, pricing);

  const addToCart = () => {
    add({ clubId: club.id, clubName: club.name, variantId: variant.id, productId: product.id, name: product.name, size: variant.size, price: product.price, memberPrice: product.memberPrice, imageUrl: product.imageUrl, stock: variant.stock });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="card product-card">
      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="product-img" /> : <div className="product-img placeholder">{product.name[0]}</div>}
      <h3>{product.name}</h3>
      {product.description && <p className="muted small clamp-2">{product.description}</p>}
      <div className="product-price">
        {mp !== null && mp < product.price ? (
          <>
            <strong>{money(mp)}</strong> <s className="muted">{money(product.price)}</s>
          </>
        ) : (
          <strong>{money(product.price)}</strong>
        )}
      </div>
      {product.variants.length > 0 && (
        <div className="size-picker" role="radiogroup" aria-label="Size">
          {product.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={Number(variantId) === v.id}
              className={`size ${Number(variantId) === v.id ? 'on' : ''}`}
              disabled={v.stock === 0}
              onClick={() => setVariantId(v.id)}
              title={v.stock === 0 ? 'Sold out' : `${v.stock} left`}
            >
              {v.size}
            </button>
          ))}
        </div>
      )}
      {variant && variant.stock <= 3 && <p className="small warn-text">Only {variant.stock} left in {variant.size}</p>}
      <button className="btn btn-primary btn-block" disabled={!variant} onClick={addToCart}>
        {!firstInStock ? 'Sold out' : added ? 'Added ✓' : 'Add to cart'}
      </button>
    </div>
  );
}
