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
  const { count } = useCart();
  const [club, setClub] = useState(null);
  const [products, setProducts] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('featured');
  const [inStockOnly, setInStockOnly] = useState(false);

  useEffect(() => {
    setClub(null);
    setProducts(null);
    setPricing(null);
    setError('');
    setSearch('');
    setCategory('All');
    setSort('featured');
    setInStockOnly(false);
    api.get(`/clubs/${clubId}`).then((r) => setClub(r.data.club)).catch((err) => setError(errorMessage(err)));
    api
      .get(`/clubs/${clubId}/products`)
      .then((r) => {
        setProducts(r.data.products);
        setPricing(r.data.pricing);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [clubId, user]);

  const categories = ['All', ...new Set((products || []).map((product) => categoryFor(product.name)))];
  const visibleProducts = (products || [])
    .filter((product) => category === 'All' || categoryFor(product.name) === category)
    .filter((product) => !search || `${product.name} ${product.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((product) => !inStockOnly || product.inStock)
    .sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

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
        <Link to="/cart" className="btn btn-ghost" aria-label={`View cart with ${count} items`}>
          Cart{count > 0 ? ` · ${count}` : ''}
        </Link>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!products && !error && <p className="muted">Loading…</p>}
      {products?.length > 0 && (
        <>
          <div className="shop-tools">
            <input className="search" type="search" placeholder="Search merchandise" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search merchandise" />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name: A to Z</option>
            </select>
            <label className="shop-stock-filter">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
              In stock only
            </label>
          </div>
          <div className="shop-categories" role="group" aria-label="Product categories">
            {categories.map((item) => (
              <button key={item} type="button" className={`shop-category ${category === item ? 'on' : ''}`} aria-pressed={category === item} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="row-between shop-results">
            <p className="muted small">{visibleProducts.length} of {products.length} products</p>
            {pricing?.isMember && <span className="badge tone-good">Member prices applied</span>}
          </div>
        </>
      )}
      {products?.length === 0 && <div className="card empty-state">No merchandise for sale right now.</div>}
      {products?.length > 0 && visibleProducts.length === 0 && <div className="card empty-state">No products match these filters.</div>}
      <div className="product-grid">
        {club &&
          visibleProducts.map((p) => (
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

function categoryFor(name) {
  const value = name.toLowerCase();
  if (value.startsWith('t-shirt')) return 'T-Shirts';
  if (value.startsWith('hoodie')) return 'Hoodies';
  if (value.startsWith('cap')) return 'Caps';
  if (value.startsWith('hand band')) return 'Hand Bands';
  if (value.startsWith('varsity jacket')) return 'Jackets';
  if (value.startsWith('canvas bag')) return 'Bags';
  if (value.startsWith('enamel pin') || value.startsWith('water bottle')) return 'Accessories';
  return 'Other';
}

const CATEGORY_ICON = {
  'T-Shirts': '👕',
  Hoodies: '🧥',
  Caps: '🧢',
  'Hand Bands': '🎗️',
  Jackets: '🧥',
  Bags: '👜',
  Accessories: '🎁',
  Other: '🛍️',
};

function ProductCard({ product, pricing, club }) {
  const { add } = useCart();
  const firstInStock = product.variants.find((v) => v.stock > 0);
  const [variantId, setVariantId] = useState(firstInStock?.id || '');
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((v) => v.id === Number(variantId));
  const mp = memberPrice(product, pricing);
  const category = categoryFor(product.name);
  const totalStock = product.variants.reduce((total, item) => total + item.stock, 0);
  const saved = mp !== null && mp < product.price ? product.price - mp : 0;

  const addToCart = () => {
    if (!variant) return;
    const addedToCart = add({ clubId: club.id, clubName: club.name, variantId: variant.id, productId: product.id, name: product.name, size: variant.size, price: product.price, memberPrice: product.memberPrice, imageUrl: product.imageUrl, stock: variant.stock });
    if (addedToCart) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    }
  };

  return (
    <div className="card product-card">
      <div className="product-visual">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="product-img" /> : <div className="product-img placeholder"><span>{CATEGORY_ICON[category]}</span><small>{category}</small></div>}
        {saved > 0 && <span className="product-deal">Save {money(saved)}</span>}
      </div>
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
      {saved > 0 && <div className="member-deal-label">Member price · save {money(saved)}</div>}
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
      <p className="product-stock muted small">{totalStock ? `${totalStock} in stock` : 'Sold out'}</p>
      {variant && variant.stock <= 3 && <p className="small warn-text">Only {variant.stock} left in {variant.size}</p>}
      <details className="product-details">
        <summary>Product details</summary>
        <p className="muted small">{product.description || 'Official merchandise from this club.'}</p>
        <p className="muted small">Selected option: {variant?.size || 'Choose an available option'}</p>
      </details>
      <button className="btn btn-primary btn-block" disabled={!variant || !product.inStock} onClick={addToCart}>
        {!firstInStock ? 'Sold out' : added ? 'Added ✓' : 'Add to cart'}
      </button>
    </div>
  );
}
