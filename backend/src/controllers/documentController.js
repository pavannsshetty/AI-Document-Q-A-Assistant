import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Document } from '../models/Document.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import {
  localDocumentStore,
  localConversationStore
} from '../services/localStoreService.js';
import {
  parseDocument,
  cleanExtractedText
} from '../services/documentParserService.js';
import { createDocumentChunks } from '../services/chunkingService.js';
import { generateEmbeddingsForChunks } from '../services/embeddingService.js';
import {
  upsertDocumentChunks,
  deleteDocumentVectors,
  getDocumentChunksFromVectorStore
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

const isMongoReady = () => mongoose.connection.readyState === 1;

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

  const storedFilePath = req.file.path;
  let documentRecord = null;
  const useMongo = isMongoReady();

  initUploadProgress({
    uploadId,
    userId: req.user.id,
    filename: req.file.originalname,
    fileSize: req.file.size
  });

  try {
    const fileType = validateUploadedFileMeta(req.file.originalname, req.file.mimetype);

    if (useMongo) {
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
    } else {
      documentRecord = localDocumentStore.create({
        userId: req.user.id,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        fileType,
        fileSize: req.file.size,
        extractedTextLength: 0,
        chunkCount: 0,
        processingStatus: 'processing'
      });
    }

    updateUploadProgress(uploadId, {
      stage: 'extracting',
      percent: 25,
      documentId: String(documentRecord._id),
      message: `Extracting and cleaning text from ${fileType.toUpperCase()} document...`
    });

    const parsed = await parseDocument(
      storedFilePath,
      fileType,
      req.file.originalname
    );

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
      message: `Generating local embeddings (0 / ${chunks.length} chunks)...`
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
          message: `Generating local embeddings (${processedCount} / ${totalCount} chunks)...`
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
      vectors,
      options: { replaceExisting: true }
    });

    if (useMongo) {
      documentRecord.extractedTextLength = parsed.extractedTextLength;
      documentRecord.extractedPages = parsed.pages;
      documentRecord.chunkCount = chunks.length;
      documentRecord.processingStatus = 'completed';
      documentRecord.errorMessage = null;
      await documentRecord.save();
    } else {
      documentRecord = localDocumentStore.update(documentRecord._id, {
        extractedTextLength: parsed.extractedTextLength,
        extractedPages: parsed.pages,
        chunkCount: chunks.length,
        processingStatus: 'completed',
        errorMessage: null
      });
    }

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
    if (!documentRecord) {
      await removeFileIfExists(storedFilePath);
    }

    updateUploadProgress(uploadId, {
      stage: 'failed',
      error: error.message,
      message: error.message || 'Document upload and indexing failed.'
    });

    if (documentRecord) {
      if (useMongo && typeof documentRecord.save === 'function') {
        documentRecord.processingStatus = 'failed';
        documentRecord.errorMessage = error.message;
        await documentRecord.save().catch(() => {});
      } else {
        localDocumentStore.update(documentRecord._id, {
          processingStatus: 'failed',
          errorMessage: error.message
        });
      }
    }

    throw error;
  }
});

const executeDocumentReindex = async (document, userId, useMongo) => {
  const docId = String(document._id);

  if (useMongo) {
    await Document.updateOne(
      { _id: docId, userId },
      { $set: { processingStatus: 'processing', errorMessage: null } }
    );
  } else {
    localDocumentStore.update(docId, {
      processingStatus: 'processing',
      errorMessage: null
    });
  }

  try {
    let parsedPages = [];
    let extractedTextLength = 0;

    const storedFilePath = document.storedName
      ? path.join(env.uploadsDir, document.storedName)
      : null;

    if (storedFilePath && fs.existsSync(storedFilePath)) {
      const parsed = await parseDocument(
        storedFilePath,
        document.fileType,
        document.originalName
      );
      parsedPages = parsed.pages;
      extractedTextLength = parsed.extractedTextLength;
    } else if (
      Array.isArray(document.extractedPages) &&
      document.extractedPages.length > 0
    ) {
      parsedPages = document.extractedPages.map((p) => ({
        page: p.page ?? null,
        text: cleanExtractedText(p.text || '')
      }));
      extractedTextLength = parsedPages.reduce((sum, p) => sum + p.text.length, 0);
    } else {
      const existingChunks = await getDocumentChunksFromVectorStore({
        documentId: docId,
        userId
      });
      if (existingChunks.length === 0) {
        throw new AppError(
          'Cannot reindex document: Original uploaded file is no longer on disk and no stored chunks were found. Please re-upload the document.',
          422,
          'REINDEX_SOURCE_MISSING'
        );
      }
      const pageMap = new Map();
      for (const ch of existingChunks) {
        const key = ch.page ?? 'null';
        const prev = pageMap.get(key) || [];
        prev.push(ch.text);
        pageMap.set(key, prev);
      }
      for (const [pageKey, texts] of pageMap.entries()) {
        const combined = cleanExtractedText(texts.join('\n\n'));
        if (combined) {
          parsedPages.push({
            page: pageKey === 'null' ? null : Number(pageKey),
            text: combined
          });
        }
      }
      extractedTextLength = parsedPages.reduce((sum, p) => sum + p.text.length, 0);
    }

    const chunks = createDocumentChunks({
      pages: parsedPages,
      documentId: docId,
      userId,
      filename: document.originalName
    });

    if (chunks.length === 0) {
      throw new AppError(
        'Reindexing failed: Could not generate valid chunks from document text.',
        422,
        'CHUNKING_FAILED'
      );
    }

    const vectors = await generateEmbeddingsForChunks(chunks);

    await deleteDocumentVectors({
      documentId: docId,
      userId
    });

    await upsertDocumentChunks({
      chunks,
      vectors,
      options: { replaceExisting: true }
    });

    let updatedDoc;
    if (useMongo) {
      updatedDoc = await Document.findOneAndUpdate(
        { _id: docId, userId },
        {
          $set: {
            extractedTextLength,
            extractedPages: parsedPages,
            chunkCount: chunks.length,
            processingStatus: 'completed',
            errorMessage: null
          }
        },
        { new: true }
      ).lean();
    } else {
      updatedDoc = localDocumentStore.update(docId, {
        extractedTextLength,
        extractedPages: parsedPages,
        chunkCount: chunks.length,
        processingStatus: 'completed',
        errorMessage: null
      });
    }

    return formatDocumentResponse(updatedDoc);
  } catch (error) {
    if (useMongo) {
      await Document.updateOne(
        { _id: docId, userId },
        {
          $set: {
            processingStatus: 'failed',
            errorMessage: error.message
          }
        }
      ).catch(() => {});
    } else {
      localDocumentStore.update(docId, {
        processingStatus: 'failed',
        errorMessage: error.message
      });
    }
    throw error;
  }
};

export const reindexDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateObjectId(id, 'Document ID');

  const useMongo = isMongoReady();
  let document = null;

  if (useMongo) {
    document = await Document.findOne({
      _id: id,
      userId: req.user.id
    })
      .select('+extractedPages')
      .lean();
  } else {
    document = localDocumentStore.findOne(id, req.user.id);
  }

  if (!document) {
    throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  const updated = await executeDocumentReindex(document, req.user.id, useMongo);

  res.status(200).json({
    success: true,
    message: 'Document reindexed successfully.',
    document: updated
  });
});

export const reindexAllDocuments = asyncHandler(async (req, res) => {
  const useMongo = isMongoReady();
  let documents = [];

  if (useMongo) {
    documents = await Document.find({ userId: req.user.id })
      .select('+extractedPages')
      .lean();
  } else {
    documents = localDocumentStore.findByUser(req.user.id);
  }

  const results = [];
  const errors = [];

  for (const doc of documents) {
    try {
      const updated = await executeDocumentReindex(doc, req.user.id, useMongo);
      results.push(updated);
    } catch (error) {
      errors.push({
        documentId: String(doc._id),
        filename: doc.originalName,
        error: error.message
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Reindexed ${results.length} of ${documents.length} documents.`,
    reindexedCount: results.length,
    failedCount: errors.length,
    documents: results,
    errors
  });
});

export const getUserDocuments = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();

  let documents = [];
  if (isMongoReady()) {
    const filter = { userId: req.user.id };
    if (search) {
      filter.originalName = { $regex: search, $options: 'i' };
    }
    documents = await Document.find(filter).sort({ createdAt: -1 }).lean();
  } else {
    documents = localDocumentStore.findByUser(req.user.id, search);
  }

  res.status(200).json({
    success: true,
    count: documents.length,
    documents: documents.map(formatDocumentResponse)
  });
});

export const getDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateObjectId(id, 'Document ID');

  let document = null;
  let conversations = [];

  if (isMongoReady()) {
    document = await Document.findOne({
      _id: id,
      userId: req.user.id
    }).lean();

    if (document) {
      conversations = await Conversation.find({
        documentId: document._id,
        userId: req.user.id
      })
        .sort({ updatedAt: -1 })
        .lean();
    }
  } else {
    document = localDocumentStore.findOne(id, req.user.id);
    if (document) {
      conversations = localConversationStore.findByUser(req.user.id, String(document._id));
    }
  }

  if (!document) {
    throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

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

  const useMongo = isMongoReady();
  let document = null;

  if (useMongo) {
    document = await Document.findOne({
      _id: id,
      userId: req.user.id
    });
  } else {
    document = localDocumentStore.findOne(id, req.user.id);
  }

  if (!document) {
    throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  await deleteDocumentVectors({
    documentId: String(document._id),
    userId: req.user.id
  });

  if (useMongo) {
    const relatedConversations = await Conversation.find({
      documentId: document._id,
      userId: req.user.id
    }).lean();

    const conversationIds = relatedConversations.map((c) => c._id);
    if (conversationIds.length > 0) {
      await Message.deleteMany({ conversationId: { $in: conversationIds } });
      await Conversation.deleteMany({ _id: { $in: conversationIds } });
    }
    await Document.deleteOne({ _id: document._id, userId: req.user.id });
  } else {
    localDocumentStore.deleteOne(document._id, req.user.id);
  }

  if (document.storedName) {
    const storedPath = path.join(env.uploadsDir, document.storedName);
    await removeFileIfExists(storedPath);
  }

  res.status(200).json({
    success: true,
    message: 'Document, vectors, and conversation history deleted successfully.',
    deletedDocumentId: String(document._id)
  });
});
