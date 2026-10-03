function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Server error';

  // Duplicate value in a unique column (e.g. email already registered)
  if (err.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    const field = Object.keys(err.fields || {})[0] || err.errors?.[0]?.path || 'value';
    message = `${field} already exists`;
  }
  // Model validation (required fields, email format, password length...)
  else if (err.name === 'SequelizeValidationError') {
    status = 400;
    message = err.errors[0].message;
  }
  // Wrong value for an ENUM, bad number, etc.
  else if (err.name === 'SequelizeDatabaseError' && /Data truncated|Incorrect .* value|Out of range/i.test(err.message)) {
    status = 400;
    message = 'One of the values is not allowed';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    status = 400;
    message = 'A related record was not found';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON body';
  }

  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 && process.env.NODE_ENV === 'production' ? 'Server error' : message });
}

module.exports = { notFound, errorHandler };
