import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  validateRegisterInput,
  validateLoginInput
} from '../middleware/validateMiddleware.js';

export const signUserToken = (userId, secret = env.jwtSecret, expiresIn = env.jwtExpiresIn) => {
  return jwt.sign({ userId: String(userId) }, secret, { expiresIn });
};

const ensureMongoConnected = () => {
  if (mongoose.connection.readyState !== 1) {
    throw new AppError(
      'MongoDB connection failed. Ensure MongoDB is running and MONGODB_URI is configured.',
      503,
      'MONGODB_CONNECTION_FAILED'
    );
  }
};

export const registerUser = asyncHandler(async (req, res) => {
  ensureMongoConnected();
  const { name, email, password } = validateRegisterInput(req.body || {});

  const existingUser = await User.findOne({ email }).lean();
  if (existingUser) {
    throw new AppError(
      'An account with this email address already exists.',
      409,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  const user = await User.create({
    name,
    email,
    password
  });

  const token = signUserToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    }
  });
});

export const loginUser = asyncHandler(async (req, res) => {
  ensureMongoConnected();
  const { email, password } = validateLoginInput(req.body || {});

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const token = signUserToken(user._id);

  res.status(200).json({
    success: true,
    token,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    }
  });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  ensureMongoConnected();
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    throw new AppError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    }
  });
});
