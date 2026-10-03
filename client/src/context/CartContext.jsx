import { createContext, useContext, useEffect, useState } from 'react';

const CartContext = createContext(null);
const KEY = 'soc_cart';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
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
    const other = items.find((i) => i.clubId && line.clubId && i.clubId !== line.clubId);
    if (other) {
      if (!confirm(`Your cart has items from ${other.clubName}. Empty it and start a ${line.clubName} order instead?`)) return false;
      setItems([{ ...line, quantity: qty }]);
      return true;
    }
    addLine(line, qty);
    return true;
  };
  const addLine = (line, qty) =>
    setItems((cur) => {
      const found = cur.find((i) => i.variantId === line.variantId);
      if (found) return cur.map((i) => (i.variantId === line.variantId ? { ...i, quantity: Math.min(10, i.quantity + qty) } : i));
      return [...cur, { ...line, quantity: qty }];
    });
  const setQty = (variantId, quantity) =>
    setItems((cur) => (quantity <= 0 ? cur.filter((i) => i.variantId !== variantId) : cur.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(10, quantity) } : i))));
  const remove = (variantId) => setItems((cur) => cur.filter((i) => i.variantId !== variantId));
  const clear = () => setItems([]);
  const count = items.reduce((a, i) => a + i.quantity, 0);

  return <CartContext.Provider value={{ items, add, setQty, remove, clear, count }}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
