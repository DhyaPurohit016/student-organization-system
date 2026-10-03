// An error carrying an HTTP status code, thrown from controllers
// and turned into a JSON response by the error middleware.
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = AppError;
