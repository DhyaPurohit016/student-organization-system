const jwt = require('jsonwebtoken');
const { User } = require('../models');
const AppError = require('../utils/AppError');

// Verifies the Bearer token and attaches the user to req.user
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('Not logged in', 401);

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new AppError('Session expired or invalid, please log in again', 401);
    }

    const user = await User.findByPk(payload.id);
    if (!user || !user.isActive) throw new AppError('Account not found or disabled', 401);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// For public pages that show more to logged-in people: attaches req.user if a valid token is sent,
// carries on as a visitor otherwise (never errors)
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await User.findByPk(payload.id);
    if (user?.isActive) req.user = user;
  } catch {
    /* bad or expired token: treat as a visitor */
  }
  next();
}

// Restricts a route to the given platform roles, e.g. authorize('PLATFORM_ADMIN')
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to do this', 403));
    }
    next();
  };
}

module.exports = { protect, optionalAuth, authorize };
