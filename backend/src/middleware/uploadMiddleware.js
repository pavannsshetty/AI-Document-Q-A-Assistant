import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

export const validateUploadedFileMeta = (originalname, mimetype) => {
  const ext = path.extname(String(originalname || '')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(
      `Invalid file extension '${ext || 'none'}'. Only .pdf, .docx, and .txt files are allowed.`,
      400,
      'INVALID_FILE_EXTENSION'
    );
  }

  const normalizedMime = String(mimetype || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new AppError(
      `Invalid file MIME type '${normalizedMime || 'unknown'}'. Allowed types: PDF, DOCX, TXT.`,
      400,
      'INVALID_FILE_MIMETYPE'
    );
  }

  return ext.slice(1);
};

if (!fs.existsSync(env.uploadsDir)) {
  fs.mkdirSync(env.uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(env.uploadsDir)) {
      fs.mkdirSync(env.uploadsDir, { recursive: true });
    }
    cb(null, env.uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBase}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  try {
    validateUploadedFileMeta(file.originalname, file.mimetype);
    cb(null, true);
  } catch (error) {
    cb(error);
  }
};

export const uploadSingleDocument = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileSizeMb * 1024 * 1024
  }
}).single('document');
