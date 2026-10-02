import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export const validateObjectId = (id, label = 'Resource ID') => {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(`Invalid ${label} format.`, 400, 'INVALID_OBJECT_ID');
  }
};

export const validateRegisterInput = (payload = {}) => {
  const rawName = payload?.name;
  const rawEmail = payload?.email;
  const rawPassword =
    typeof payload?.password === 'string'
      ? payload.password
      : String(payload?.password ?? '');

  const trimmedName = String(rawName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  const trimmedEmail = String(rawEmail ?? '')
    .trim()
    .toLowerCase();

  if (!trimmedName || trimmedName.length < 2) {
    throw new AppError('Name must be at least 2 characters long.', 400, 'VALIDATION_ERROR');
  }

  if (trimmedName.length > 80) {
    throw new AppError('Name cannot exceed 80 characters.', 400, 'VALIDATION_ERROR');
  }

  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new AppError('Please provide a valid email address.', 400, 'VALIDATION_ERROR');
  }

  if (!rawPassword || rawPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters long.', 400, 'VALIDATION_ERROR');
  }

  if (rawPassword.length > 128) {
    throw new AppError('Password cannot exceed 128 characters.', 400, 'VALIDATION_ERROR');
  }

  return {
    name: trimmedName,
    email: trimmedEmail,
    password: rawPassword
  };
};

export const validateLoginInput = (payload = {}) => {
  const trimmedEmail = String(payload?.email ?? '')
    .trim()
    .toLowerCase();
  const rawPassword =
    typeof payload?.password === 'string'
      ? payload.password
      : String(payload?.password ?? '');

  if (!trimmedEmail || !rawPassword) {
    throw new AppError('Email and password are required.', 400, 'VALIDATION_ERROR');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new AppError('Please provide a valid email address.', 400, 'VALIDATION_ERROR');
  }

  return {
    email: trimmedEmail,
    password: rawPassword
  };
};

export const validateChatInput = ({ documentId, conversationId, question }) => {
  const trimmedQuestion = String(question || '').trim();
  if (!trimmedQuestion) {
    throw new AppError('Question cannot be empty.', 400, 'EMPTY_QUESTION');
  }

  if (trimmedQuestion.length > 2000) {
    throw new AppError('Question cannot exceed 2000 characters.', 400, 'QUESTION_TOO_LONG');
  }

  if (!documentId && !conversationId) {
    throw new AppError(
      'Either documentId or conversationId is required to ask a question.',
      400,
      'MISSING_DOCUMENT_ID'
    );
  }

  if (documentId) {
    validateObjectId(documentId, 'documentId');
  }

  if (conversationId) {
    validateObjectId(conversationId, 'conversationId');
  }

  return {
    documentId: documentId ? String(documentId) : null,
    conversationId: conversationId ? String(conversationId) : null,
    question: trimmedQuestion
  };
};
