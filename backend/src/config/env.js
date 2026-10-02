import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);

const backendEnvPath = path.resolve(currentDirname, '../../.env');
const rootEnvPath = path.resolve(currentDirname, '../../../.env');

const loadEnvFileWithoutEmptyLocks = (envFilePath) => {
  try {
    if (!fs.existsSync(envFilePath)) {
      return;
    }
    const raw = fs.readFileSync(envFilePath, 'utf-8');
    const parsed = dotenv.parse(raw);
    for (const [key, val] of Object.entries(parsed)) {
      const existing = process.env[key];
      const cleanedVal = String(val || '').trim();
      if (
        (existing === undefined || String(existing).trim() === '') &&
        cleanedVal !== ''
      ) {
        process.env[key] = cleanedVal;
      }
    }
  } catch {
    // Ignore unreadable .env file and fall back to process.env defaults
  }
};

loadEnvFileWithoutEmptyLocks(backendEnvPath);
loadEnvFileWithoutEmptyLocks(rootEnvPath);
dotenv.config({ path: backendEnvPath, quiet: true });
dotenv.config({ path: rootEnvPath, quiet: true });

const cleanEnvString = (value, fallback) => {
  const trimmed = String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  if (!trimmed || trimmed.startsWith('MY_')) {
    return fallback;
  }
  return trimmed;
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  port: toInt(process.env.PORT, 5000),
  nodeEnv: cleanEnvString(process.env.NODE_ENV, 'development'),
  mongodbUri: cleanEnvString(
    process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL,
    ''
  ),
  mongodbDbName: cleanEnvString(
    process.env.MONGODB_DB_NAME || process.env.DB_NAME,
    'ai_document_qa'
  ),
  jwtSecret: cleanEnvString(
    process.env.JWT_SECRET,
    'local_dev_jwt_secret_change_in_production_env'
  ),
  jwtExpiresIn: cleanEnvString(process.env.JWT_EXPIRES_IN, '7d'),
  ollamaUrl: cleanEnvString(process.env.OLLAMA_URL, 'http://localhost:11434').replace(
    /\/+$/,
    ''
  ),
  ollamaChatModel: cleanEnvString(process.env.OLLAMA_CHAT_MODEL, 'llama3.2:3b'),
  ollamaEmbedModel: cleanEnvString(
    process.env.OLLAMA_EMBED_MODEL,
    'nomic-embed-text'
  ),
  qdrantUrl: cleanEnvString(process.env.QDRANT_URL, 'http://localhost:6333').replace(
    /\/+$/,
    ''
  ),
  qdrantApiKey: cleanEnvString(process.env.QDRANT_API_KEY, ''),
  qdrantCollection: cleanEnvString(
    process.env.QDRANT_COLLECTION,
    'document_chunks'
  ),
  chunkSize: toInt(process.env.CHUNK_SIZE, 800),
  chunkOverlap: toInt(process.env.CHUNK_OVERLAP, 150),
  similarityThreshold: toFloat(process.env.SIMILARITY_THRESHOLD, 0.25),
  topKChunks: toInt(process.env.TOP_K_CHUNKS, 5),
  maxFileSizeMb: toInt(process.env.MAX_FILE_SIZE_MB, 20),
  clientUrl: cleanEnvString(process.env.CLIENT_URL, 'http://localhost:5173'),
  uploadsDir: path.resolve(currentDirname, '../../uploads')
};
