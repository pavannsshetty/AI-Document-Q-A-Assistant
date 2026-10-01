import { Document } from '../models/Document.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { answerQuestionWithRag } from '../services/ragService.js';
import {
  validateChatInput,
  validateObjectId
} from '../middleware/validateMiddleware.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const formatMessage = (msg) => ({
  id: String(msg._id),
  _id: String(msg._id),
  conversationId: String(msg.conversationId),
  role: msg.role,
  content: msg.content,
  sources: Array.isArray(msg.sources) ? msg.sources : [],
  createdAt: msg.createdAt
});

export const askQuestion = asyncHandler(async (req, res) => {
  const { documentId: inputDocId, conversationId: inputConvId, question } =
    validateChatInput(req.body || {});

  let conversation = null;
  let resolvedDocumentId = inputDocId;

  if (inputConvId) {
    conversation = await Conversation.findOne({
      _id: inputConvId,
      userId: req.user.id
    });

    if (!conversation) {
      throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (resolvedDocumentId && String(conversation.documentId) !== resolvedDocumentId) {
      throw new AppError(
        'Conversation does not belong to the specified document.',
        400,
        'CONVERSATION_DOCUMENT_MISMATCH'
      );
    }

    resolvedDocumentId = String(conversation.documentId);
  }

  const document = await Document.findOne({
    _id: resolvedDocumentId,
    userId: req.user.id
  }).lean();

  if (!document) {
    throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  if (document.processingStatus !== 'completed') {
    throw new AppError(
      `Document is currently '${document.processingStatus}' and cannot be queried.`,
      400,
      'DOCUMENT_NOT_READY'
    );
  }

  if (!conversation) {
    const title = question.length > 80 ? `${question.slice(0, 77)}...` : question;
    conversation = await Conversation.create({
      userId: req.user.id,
      documentId: document._id,
      title
    });
  } else if (conversation.title === 'New Conversation' || !conversation.title) {
    conversation.title = question.length > 80 ? `${question.slice(0, 77)}...` : question;
  }

  const ragResult = await answerQuestionWithRag({
    question,
    documentId: String(document._id),
    userId: req.user.id
  });

  const userMessage = await Message.create({
    conversationId: conversation._id,
    role: 'user',
    content: question,
    sources: []
  });

  const assistantMessage = await Message.create({
    conversationId: conversation._id,
    role: 'assistant',
    content: ragResult.answer,
    sources: ragResult.sources
  });

  conversation.updatedAt = new Date();
  await conversation.save();

  res.status(200).json({
    success: true,
    answer: ragResult.answer,
    sources: ragResult.sources,
    conversationId: String(conversation._id),
    userMessage: formatMessage(userMessage),
    assistantMessage: formatMessage(assistantMessage)
  });
});

export const createConversation = asyncHandler(async (req, res) => {
  const { documentId, title } = req.body || {};
  validateObjectId(documentId, 'documentId');

  const document = await Document.findOne({
    _id: documentId,
    userId: req.user.id
  }).lean();

  if (!document) {
    throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  if (document.processingStatus !== 'completed') {
    throw new AppError(
      `Document processing status is '${document.processingStatus}'. Only completed documents can start a chat.`,
      400,
      'DOCUMENT_NOT_READY'
    );
  }

  const conversationTitle =
    String(title || '').trim() || `Chat: ${document.originalName}`;

  const conversation = await Conversation.create({
    userId: req.user.id,
    documentId: document._id,
    title: conversationTitle.slice(0, 160)
  });

  res.status(201).json({
    success: true,
    conversation: {
      id: String(conversation._id),
      _id: String(conversation._id),
      userId: String(conversation.userId),
      documentId: String(conversation.documentId),
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    }
  });
});

export const getUserConversations = asyncHandler(async (req, res) => {
  const { documentId } = req.query;
  const filter = { userId: req.user.id };

  if (documentId) {
    validateObjectId(documentId, 'documentId');
    filter.documentId = documentId;
  }

  const conversations = await Conversation.find(filter)
    .populate('documentId', 'originalName fileType fileSize processingStatus chunkCount')
    .sort({ updatedAt: -1 })
    .lean();

  const formatted = conversations.map((conv) => {
    const docObj =
      conv.documentId && typeof conv.documentId === 'object' ? conv.documentId : null;
    return {
      id: String(conv._id),
      _id: String(conv._id),
      userId: String(conv.userId),
      documentId: docObj ? String(docObj._id) : String(conv.documentId),
      document: docObj
        ? {
            id: String(docObj._id),
            originalName: docObj.originalName,
            fileType: docObj.fileType,
            fileSize: docObj.fileSize,
            processingStatus: docObj.processingStatus,
            chunkCount: docObj.chunkCount
          }
        : null,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt
    };
  });

  res.status(200).json({
    success: true,
    count: formatted.length,
    conversations: formatted
  });
});

export const getConversationById = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  validateObjectId(conversationId, 'conversationId');

  const conversation = await Conversation.findOne({
    _id: conversationId,
    userId: req.user.id
  }).lean();

  if (!conversation) {
    throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
  }

  const document = await Document.findOne({
    _id: conversation.documentId,
    userId: req.user.id
  }).lean();

  if (!document) {
    throw new AppError('Associated document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  const messages = await Message.find({
    conversationId: conversation._id
  })
    .sort({ createdAt: 1 })
    .lean();

  res.status(200).json({
    success: true,
    conversation: {
      id: String(conversation._id),
      _id: String(conversation._id),
      userId: String(conversation.userId),
      documentId: String(conversation.documentId),
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    },
    document: {
      id: String(document._id),
      _id: String(document._id),
      originalName: document.originalName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      extractedTextLength: document.extractedTextLength,
      chunkCount: document.chunkCount,
      processingStatus: document.processingStatus,
      createdAt: document.createdAt
    },
    messages: messages.map(formatMessage)
  });
});

export const deleteConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  validateObjectId(conversationId, 'conversationId');

  const conversation = await Conversation.findOne({
    _id: conversationId,
    userId: req.user.id
  });

  if (!conversation) {
    throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
  }

  await Message.deleteMany({ conversationId: conversation._id });
  await Conversation.deleteOne({ _id: conversation._id, userId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Conversation deleted successfully.',
    deletedConversationId: String(conversation._id)
  });
});
