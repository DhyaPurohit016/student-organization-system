export function normalizeMerchandiseItem(line) {
  if (!line || typeof line !== 'object' || 'eventId' in line || 'ticketId' in line || 'ticketCode' in line) return null;
  const clubId = Number(line.clubId);
  const productId = Number(line.productId);
  const variantId = Number(line.variantId);
  const price = Number(line.price);
  const quantity = Number(line.quantity);
  if (
    !Number.isInteger(clubId) || clubId < 1 ||
    !Number.isInteger(productId) || productId < 1 ||
    !Number.isInteger(variantId) || variantId < 1 ||
    !Number.isFinite(price) || price < 0 ||
    !Number.isInteger(quantity) || quantity < 1 ||
    typeof line.name !== 'string' || !line.name.trim() ||
    typeof line.size !== 'string' || !line.size.trim()
  ) return null;
  return { ...line, type: 'PRODUCT', clubId, productId, variantId, price, quantity: Math.min(10, quantity) };
}
