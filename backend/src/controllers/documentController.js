import path from 'path';
import { env } from '../config/env.js';
import { Document } from '../models/Document.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { parseDocument } from '../services/documentParserService.js';
import { createDocumentChunks } from '../services/chunkingService.js';
import { generateEmbeddingsForChunks } from '../services/embeddingService.js';
import {
  upsertDocumentChunks,
  deleteDocumentVectors
} from '../services/qdrantService.js';
import {
  initUploadProgress,
  updateUploadProgress,
  getUploadProgress
} from '../services/uploadProgressService.js';
import { validateUploadedFileMeta } from '../middleware/uploadMiddleware.js';
import { validateObjectId } from '../middleware/validateMiddleware.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { removeFileIfExists } from '../utils/fileCleanup.js';

const formatDocumentResponse = (doc) => ({
  id: String(doc._id),
  _id: String(doc._id),
  userId: String(doc.userId),
  originalName: doc.originalName,
  storedName: doc.storedName,
  fileType: doc.fileType,
  fileSize: doc.fileSize,
  extractedTextLength: doc.extractedTextLength,
  chunkCount: doc.chunkCount,
  processingStatus: doc.processingStatus,
  errorMessage: doc.errorMessage || null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt
});

export const getDocumentUploadProgress = asyncHandler(async (req, res) => {
  const { uploadId } = req.params;
  const progress = getUploadProgress(uploadId, req.user.id);

  if (!progress) {
    return res.status(200).json({
      success: true,
      progress: {
        uploadId: String(uploadId),
        stage: 'uploading',
        percent: 10,
        message: 'Uploading document to server...',
        processedChunks: 0,
        totalChunks: 0,
        extractedTextLength: 0,
        documentId: null,
        error: null
      }
    });
  }

  res.status(200).json({
    success: true,
    progress
  });
});

export const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(
      'No document file provided. Please upload a PDF, DOCX, or TXT file under the field name "document".',
      400,
      'FILE_REQUIRED'
    );
  }

  const uploadId =
    req.headers['x-upload-id'] ||
    req.query?.uploadId ||
    req.body?.uploadId ||
    null;

  const tempFilePath = req.file.path;
  let documentRecord = null;

  initUploadProgress({
    uploadId,
    userId: req.user.id,
    filename: req.file.originalname,
    fileSize: req.file.size
  });

  try {
    const fileType = validateUploadedFileMeta(req.file.originalname, req.file.mimetype);

    documentRecord = await Document.create({
      userId: req.user.id,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      fileType,
      fileSize: req.file.size,
      extractedTextLength: 0,
      chunkCount: 0,
      processingStatus: 'processing'
    });

    updateUploadProgress(uploadId, {
      stage: 'extracting',
      percent: 25,
      documentId: String(documentRecord._id),
      message: `Extracting and cleaning text from ${fileType.toUpperCase()} document...`
    });

    const parsed = await parseDocument(tempFilePath, fileType);

    updateUploadProgress(uploadId, {
      stage: 'chunking',
      percent: 38,
      extractedTextLength: parsed.extractedTextLength,
      message: `Extracted ${parsed.extractedTextLength.toLocaleString()} characters. Splitting into overlapping chunks...`
    });

    const chunks = createDocumentChunks({
      pages: parsed.pages,
      documentId: documentRecord._id,
      userId: req.user.id,
      filename: req.file.originalname
    });

    if (chunks.length === 0) {
      throw new AppError(
        'Document processing failed: Could not split document into valid text chunks.',
        422,
        'CHUNKING_FAILED'
      );
    }

    updateUploadProgress(uploadId, {
      stage: 'embedding',
      percent: 45,
      totalChunks: chunks.length,
      processedChunks: 0,
      message: `Generating local embeddings with Ollama (0 / ${chunks.length} chunks)...`
    });

    const vectors = await generateEmbeddingsForChunks(chunks, {
      onProgress: (processedCount, totalCount) => {
        const ratio = totalCount > 0 ? processedCount / totalCount : 1;
        const embeddingPercent = 45 + Math.round(ratio * 40);
        updateUploadProgress(uploadId, {
          stage: 'embedding',
          percent: embeddingPercent,
          processedChunks: processedCount,
          totalChunks: totalCount,
          message: `Generating local embeddings with Ollama (${processedCount} / ${totalCount} chunks)...`
        });
      }
    });

    updateUploadProgress(uploadId, {
      stage: 'indexing',
      percent: 90,
      processedChunks: chunks.length,
      totalChunks: chunks.length,
      message: `Indexing ${chunks.length} vector embeddings in Qdrant...`
    });

    await upsertDocumentChunks({
      chunks,
      vectors
    });

    documentRecord.extractedTextLength = parsed.extractedTextLength;
    documentRecord.chunkCount = chunks.length;
    documentRecord.processingStatus = 'completed';
    documentRecord.errorMessage = null;
    await documentRecord.save();

    await removeFileIfExists(tempFilePath);

    updateUploadProgress(uploadId, {
      stage: 'completed',
      percent: 100,
      processedChunks: chunks.length,
      totalChunks: chunks.length,
      extractedTextLength: parsed.extractedTextLength,
      documentId: String(documentRecord._id),
      message: 'Document uploaded and indexed successfully.'
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded and indexed successfully.',
      document: formatDocumentResponse(documentRecord)
    });
  } catch (error) {
    await removeFileIfExists(tempFilePath);

    updateUploadProgress(uploadId, {
      stage: 'failed',
      error: error.message,
      message: error.message || 'Document upload and indexing failed.'
    });

    if (documentRecord) {
      documentRecord.processingStatus = 'failed';
      documentRecord.errorMessage = error.message;
      await documentRecord.save().catch(() => {});
    }

    throw error;
  }
});

export const getUserDocuments = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const filter = { userId: req.user.id };

  if (search) {
    filter.originalName = { $regex: search, $options: 'i' };
  }

  const documents = await Document.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: documents.length,
    documents: documents.map(formatDocumentResponse)
  });
});

export const getDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateObjectId(id, 'Document ID');

  const document = await Document.findOne({
    _id: id,
    userId: req.user.id
  }).lean();

  if (!document) {
    throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  const conversations = await Conversation.find({
    documentId: document._id,
    userId: req.user.id
  })
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    document: formatDocumentResponse(document),
    conversations: conversations.map((conv) => ({
      id: String(conv._id),
      _id: String(conv._id),
      documentId: String(conv.documentId),
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt
    }))
  });
});

export const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateObjectId(id, 'Document ID');

  const document = await Document.findOne({
    _id: id,
    userId: req.user.id
  });

  if (!document) {
    throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  await deleteDocumentVectors({
    documentId: String(document._id),
    userId: req.user.id
  });

  const relatedConversations = await Conversation.find({
    documentId: document._id,
    userId: req.user.id
  }).lean();

  const conversationIds = relatedConversations.map((c) => c._id);
  if (conversationIds.length > 0) {
    await Message.deleteMany({ conversationId: { $in: conversationIds } });
    await Conversation.deleteMany({ _id: { $in: conversationIds } });
  }

  if (document.storedName) {
    const storedPath = path.join(env.uploadsDir, document.storedName);
    await removeFileIfExists(storedPath);
  }

  await Document.deleteOne({ _id: document._id, userId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Document, vectors, and conversation history deleted successfully.',
    deletedDocumentId: String(document._id)
  });
});
