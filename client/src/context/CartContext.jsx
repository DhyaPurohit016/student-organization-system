import { createContext, useContext, useEffect, useState } from 'react';
import { normalizeMerchandiseItem } from '../utils/cart';

const CartContext = createContext(null);
const KEY = 'soc_cart';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved) ? saved.map(normalizeMerchandiseItem).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Shopping cart kept in the browser. Lines: { variantId, productId, name, size, price, imageUrl, quantity }
export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage blocked: cart still works for this visit */
    }
  }, [items]);

  // Each club runs its own shop, so the cart holds one club's items at a time
  const add = (line, qty = 1) => {
    const item = normalizeMerchandiseItem({ ...line, quantity: qty });
    if (!item) return false;
    const other = items.find((i) => i.clubId !== item.clubId);
    if (other) {
      if (!confirm(`Your cart has items from ${other.clubName}. Empty it and start a ${item.clubName} order instead?`)) return false;
      setItems([item]);
      return true;
    }
    addLine(item);
    return true;
  };
  const addLine = (line) =>
    setItems((cur) => {
      const found = cur.find((i) => i.variantId === line.variantId);
      if (found) return cur.map((i) => (i.variantId === line.variantId ? { ...i, quantity: Math.min(10, i.quantity + line.quantity) } : i));
      return [...cur, line];
    });
  const setQty = (variantId, quantity) =>
    setItems((cur) => (quantity <= 0 ? cur.filter((i) => i.variantId !== variantId) : cur.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(10, quantity) } : i))));
  const remove = (variantId) => setItems((cur) => cur.filter((i) => i.variantId !== variantId));
  const clear = () => setItems([]);
  const count = items.reduce((a, i) => a + i.quantity, 0);

  return <CartContext.Provider value={{ items, add, setQty, remove, clear, count }}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
