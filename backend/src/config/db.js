import mongoose from 'mongoose';
import { env } from './env.js';
import { User } from '../models/User.js';
import { localUserStore } from '../services/localStoreService.js';

let isConnected = false;
let lastConnectionError = null;
let lastConnectAttemptAt = 0;
let activeConnectPromise = null;

const RECONNECT_COOLDOWN_MS = 4000;

const uriHasExplicitDbName = (uri) => {
  const raw = String(uri || '').trim();
  const withoutScheme = raw.replace(/^mongodb(?:\+srv)?:\/\//i, '');
  const slashIdx = withoutScheme.indexOf('/');
  if (slashIdx === -1) {
    return false;
  }
  const pathPart = withoutScheme.slice(slashIdx + 1).split('?')[0].trim();
  return pathPart.length > 0;
};

export const syncSingleUserToMongo = async (localUser) => {
  if (!localUser || !localUser.email || !localUser.password) {
    return null;
  }
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  const normalizedEmail = String(localUser.email).trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail }).select('+password');
  if (existing) {
    localUserStore.upsertSyncedUser({
      _id: String(existing._id),
      name: existing.name,
      email: existing.email,
      password: existing.password,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt
    });
    return existing;
  }

  const candidateId =
    localUser._id && mongoose.Types.ObjectId.isValid(String(localUser._id))
      ? new mongoose.Types.ObjectId(String(localUser._id))
      : new mongoose.Types.ObjectId();

  try {
    const created = await User.create({
      _id: candidateId,
      name: String(localUser.name || 'User').trim(),
      email: normalizedEmail,
      password: String(localUser.password)
    });
    return created;
  } catch (err) {
    if (err?.code === 11000) {
      return User.findOne({ email: normalizedEmail }).select('+password');
    }
    return null;
  }
};

export const syncLocalUsersToMongo = async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  try {
    const localUsers = localUserStore.listAll();
    for (const localUser of localUsers) {
      await syncSingleUserToMongo(localUser);
    }
  } catch {
    // Non-fatal background sync
  }
};

export const getDbStatus = () => ({
  connected: mongoose.connection.readyState === 1,
  readyState: mongoose.connection.readyState,
  dbName:
    mongoose.connection.readyState === 1
      ? mongoose.connection.name || env.mongodbDbName
      : env.mongodbDbName,
  error: lastConnectionError
});

export const connectDatabase = async (customUri) => {
  const uri = String(customUri ?? env.mongodbUri ?? '').trim();

  if (!uri) {
    lastConnectionError = 'MONGODB_URI is not configured in environment variables.';
    throw new Error(lastConnectionError);
  }

  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    lastConnectionError = null;
    return mongoose.connection;
  }

  if (activeConnectPromise) {
    return activeConnectPromise;
  }

  activeConnectPromise = (async () => {
    try {
      lastConnectAttemptAt = Date.now();
      mongoose.set('strictQuery', true);

      const connectOptions = {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      };

      if (!uriHasExplicitDbName(uri) && env.mongodbDbName) {
        connectOptions.dbName = env.mongodbDbName;
      }

      await mongoose.connect(uri, connectOptions);
      isConnected = true;
      lastConnectionError = null;
      await syncLocalUsersToMongo();
      return mongoose.connection;
    } catch (error) {
      isConnected = false;
      lastConnectionError = error.message;
      throw new Error(`MongoDB connection failed: ${error.message}`);
    } finally {
      activeConnectPromise = null;
    }
  })();

  return activeConnectPromise;
};

export const ensureDatabaseConnected = async () => {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (activeConnectPromise) {
    try {
      await activeConnectPromise;
      return mongoose.connection.readyState === 1;
    } catch {
      return false;
    }
  }

  if (mongoose.connection.readyState === 2) {
    try {
      await mongoose.connection.asPromise();
      return mongoose.connection.readyState === 1;
    } catch {
      return false;
    }
  }

  if (
    env.mongodbUri &&
    process.env.NODE_ENV !== 'test' &&
    Date.now() - lastConnectAttemptAt > RECONNECT_COOLDOWN_MS
  ) {
    try {
      await connectDatabase(env.mongodbUri);
      return mongoose.connection.readyState === 1;
    } catch {
      return false;
    }
  }

  return mongoose.connection.readyState === 1;
};

export const disconnectDatabase = async () => {
  activeConnectPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
};
