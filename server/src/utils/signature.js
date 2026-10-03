const crypto = require('crypto');

const hmacSha256 = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// Constant-time comparison, so signatures can't be guessed byte by byte from response timing
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { hmacSha256, safeEqual };
