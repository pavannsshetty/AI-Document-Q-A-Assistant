import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

export const errorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: `File is too large. Maximum allowed upload size is ${env.maxFileSizeMb} MB.`
      });
    }
    return res.status(400).json({
      success: false,
      code: 'FILE_UPLOAD_ERROR',
      message: `File upload failed: ${err.message}`
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message
    });
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((item) => item.message);
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: messages.join(' ') || 'Validation failed.'
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_RESOURCE',
      message: 'An account with this email address already exists.'
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Invalid resource identifier provided.'
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      code: 'INVALID_JWT',
      message: 'Invalid JWT token. Please log in again.'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'Session expired. Please log in again.'
    });
  }

  if (
    err.name === 'MongooseServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    String(err.message || '').includes('buffering timed out')
  ) {
    return res.status(503).json({
      success: false,
      code: 'MONGODB_CONNECTION_FAILED',
      message:
        'MongoDB connection failed. Ensure MongoDB or MongoDB Atlas is reachable and MONGODB_URI is configured.'
    });
  }

  console.error('Unhandled Backend Error:', err.message);

  return res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred while processing the request.'
  });
};
