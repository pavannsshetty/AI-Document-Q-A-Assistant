import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const verifyTokenString = (token, secret = env.jwtSecret) => {
  if (!token) {
    throw new AppError('Authentication required. Please log in.', 401, 'AUTH_TOKEN_MISSING');
  }
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Session expired. Please log in again.', 401, 'AUTH_TOKEN_EXPIRED');
    }
    throw new AppError('Invalid JWT token. Please log in again.', 401, 'INVALID_JWT');
  }
};

export const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new AppError(
      'Authentication required. Provide a Bearer token in the Authorization header.',
      401,
      'AUTH_TOKEN_MISSING'
    );
  }

  const token = authHeader.slice(7).trim();
  const decoded = verifyTokenString(token);

  if (mongoose.connection.readyState !== 1) {
    throw new AppError(
      'MongoDB connection failed. Ensure MongoDB is running and MONGODB_URI is configured.',
      503,
      'MONGODB_UNAVAILABLE'
    );
  }

  const user = await User.findById(decoded.userId).lean();
  if (!user) {
    throw new AppError('Authenticated user account no longer exists.', 401, 'USER_NOT_FOUND');
  }

  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email
  };

  next();
});
