import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import {
  ensureDatabaseConnected,
  syncSingleUserToMongo
} from '../config/db.js';
import { User } from '../models/User.js';
import { localUserStore } from '../services/localStoreService.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  validateRegisterInput,
  validateLoginInput
} from '../middleware/validateMiddleware.js';

export const signUserToken = (
  userId,
  secret = env.jwtSecret,
  expiresIn = env.jwtExpiresIn
) => {
  return jwt.sign({ userId: String(userId) }, secret, { expiresIn });
};

const isMongoReady = () => mongoose.connection.readyState === 1;

export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = validateRegisterInput(req.body || {});

  await ensureDatabaseConnected();

  let user = null;

  if (isMongoReady()) {
    const existingMongoUser = await User.findOne({ email }).select('+password');
    if (existingMongoUser) {
      localUserStore.upsertSyncedUser({
        _id: String(existingMongoUser._id),
        name: existingMongoUser.name,
        email: existingMongoUser.email,
        password: existingMongoUser.password,
        createdAt: existingMongoUser.createdAt,
        updatedAt: existingMongoUser.updatedAt
      });
      throw new AppError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_EXISTS'
      );
    }

    const existingLocalUser = localUserStore.findByEmail(email);
    if (existingLocalUser) {
      await syncSingleUserToMongo(existingLocalUser);
      throw new AppError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_EXISTS'
      );
    }

    try {
      const createdUser = await User.create({
        name,
        email,
        password
      });
      user = createdUser;

      localUserStore.upsertSyncedUser({
        _id: String(createdUser._id),
        name: createdUser.name,
        email: createdUser.email,
        password: createdUser.password,
        createdAt: createdUser.createdAt,
        updatedAt: createdUser.updatedAt
      });
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(
          'An account with this email address already exists.',
          409,
          'EMAIL_ALREADY_EXISTS'
        );
      }
      throw err;
    }
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

  if (!user || !user._id) {
    throw new AppError(
      'Unable to save user account. Please try again.',
      500,
      'USER_CREATE_FAILED'
    );
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

  await ensureDatabaseConnected();

  let user = null;
  let isPasswordMatch = false;

  if (isMongoReady()) {
    user = await User.findOne({ email }).select('+password');
    if (user) {
      isPasswordMatch = await user.comparePassword(password);
      if (isPasswordMatch) {
        localUserStore.upsertSyncedUser({
          _id: String(user._id),
          name: user.name,
          email: user.email,
          password: user.password,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        });
      }
    } else {
      const fallbackLocalUser = localUserStore.findByEmail(email);
      if (fallbackLocalUser) {
        isPasswordMatch = await bcrypt.compare(
          password,
          fallbackLocalUser.password
        );
        if (isPasswordMatch) {
          const syncedMongoUser = await syncSingleUserToMongo(fallbackLocalUser);
          user = syncedMongoUser || fallbackLocalUser;
        }
      }
    }
  } else {
    user = localUserStore.findByEmail(email);
    if (user && user.password) {
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
  await ensureDatabaseConnected();

  let user = null;
  if (isMongoReady()) {
    if (mongoose.Types.ObjectId.isValid(String(req.user.id))) {
      user = await User.findById(req.user.id).lean();
    }
    if (!user && req.user.email) {
      user = await User.findOne({
        email: String(req.user.email).trim().toLowerCase()
      }).lean();
    }
    if (!user) {
      const localUser =
        localUserStore.findById(req.user.id) ||
        (req.user.email ? localUserStore.findByEmail(req.user.email) : null);
      if (localUser) {
        const synced = await syncSingleUserToMongo(localUser);
        user = synced || localUser;
      }
    }
  } else {
    user =
      localUserStore.findById(req.user.id) ||
      (req.user.email ? localUserStore.findByEmail(req.user.email) : null);
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
