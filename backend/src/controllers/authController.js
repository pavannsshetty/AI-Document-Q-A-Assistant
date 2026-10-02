import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { localUserStore } from '../services/localStoreService.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  validateRegisterInput,
  validateLoginInput
} from '../middleware/validateMiddleware.js';

export const signUserToken = (userId, secret = env.jwtSecret, expiresIn = env.jwtExpiresIn) => {
  return jwt.sign({ userId: String(userId) }, secret, { expiresIn });
};

const isMongoReady = () => mongoose.connection.readyState === 1;

export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = validateRegisterInput(req.body || {});

  let user;
  if (isMongoReady()) {
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      throw new AppError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_EXISTS'
      );
    }

    user = await User.create({
      name,
      email,
      password
    });
  } else {
    const existingUser = localUserStore.findByEmail(email);
    if (existingUser) {
      throw new AppError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_EXISTS'
      );
    }

    user = await localUserStore.create({
      name,
      email,
      password
    });
  }

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
  const { email, password } = validateLoginInput(req.body || {});

  let user;
  let isPasswordMatch = false;

  if (isMongoReady()) {
    user = await User.findOne({ email }).select('+password');
    if (user) {
      isPasswordMatch = await user.comparePassword(password);
    }
  } else {
    user = localUserStore.findByEmail(email);
    if (user) {
      isPasswordMatch = await bcrypt.compare(password, user.password);
    }
  }

  if (!user || !isPasswordMatch) {
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
  let user;
  if (isMongoReady()) {
    user = await User.findById(req.user.id).lean();
  } else {
    user = localUserStore.findById(req.user.id);
  }

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
