class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log the error
  console.error(`[${new Date().toISOString()}] Error: ${message}`, {
    statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Send error response
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message
  });
};

export { AppError, errorHandler };
