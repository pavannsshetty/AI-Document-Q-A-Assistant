import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;
let lastConnectionError = null;

export const getDbStatus = () => ({
  connected: mongoose.connection.readyState === 1,
  readyState: mongoose.connection.readyState,
  error: lastConnectionError
});

export const connectDatabase = async (customUri) => {
  const uri = customUri || env.mongodbUri;

  if (!uri) {
    lastConnectionError = 'MONGODB_URI is not configured in environment variables.';
    throw new Error(lastConnectionError);
  }

  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    lastConnectionError = null;
    return mongoose.connection;
  } catch (error) {
    isConnected = false;
    lastConnectionError = error.message;
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
};
