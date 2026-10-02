import { env } from '../config/env.js';

const sanitizePreviewText = (text, maxLength = 120) => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  const singleLine = text.replace(/\s+/g, ' ').trim();
  const clipped =
    singleLine.length > maxLength
      ? `${singleLine.slice(0, maxLength)}...`
      : singleLine;
  return clipped;
};

export const ragLogger = {
  logExtraction: ({ filename, fileType, extractedTextLength, pageCount, previewText }) => {
    if (env.nodeEnv === 'test') {
      return;
    }
    console.log(
      JSON.stringify({
        event: 'RAG_TEXT_EXTRACTION',
        filename,
        fileType,
        extractedTextLength,
        pageCount,
        preview: sanitizePreviewText(previewText, 120)
      })
    );
  },

  logChunking: ({ documentId, filename, chunkCount }) => {
    if (env.nodeEnv === 'test') {
      return;
    }
    console.log(
      JSON.stringify({
        event: 'RAG_CHUNKING_COMPLETE',
        documentId: String(documentId),
        filename,
        chunksCreated: chunkCount
      })
    );
  },

  logIndexing: ({ documentId, filename, indexedCount, vectorDimension, storageBackend }) => {
    if (env.nodeEnv === 'test') {
      return;
    }
    console.log(
      JSON.stringify({
        event: 'RAG_INDEXING_COMPLETE',
        documentId: String(documentId),
        filename,
        chunksIndexed: indexedCount,
        embeddingDimension: vectorDimension,
        storageBackend
      })
    );
  },

  logRetrieval: ({
    documentId,
    userId,
    filterApplied,
    rawResultCount,
    filteredResultCount,
    scores,
    filenames,
    chunkIndices,
    retrievalMode
  }) => {
    if (env.nodeEnv === 'test') {
      return;
    }
    console.log(
      JSON.stringify({
        event: 'RAG_RETRIEVAL_RESULTS',
        documentId: String(documentId),
        userFilterApplied: Boolean(userId),
        documentFilterApplied: Boolean(filterApplied),
        retrievalMode,
        qdrantResultCount: rawResultCount,
        selectedChunkCount: filteredResultCount,
        similarityScores: scores,
        retrievedFilenames: filenames,
        retrievedChunkIndices: chunkIndices
      })
    );
  },

  logFallbackReason: ({ documentId, reason, questionLength, topScore }) => {
    if (env.nodeEnv === 'test') {
      return;
    }
    console.warn(
      JSON.stringify({
        event: 'RAG_NOT_FOUND_FALLBACK',
        documentId: String(documentId),
        reason,
        questionLength,
        topScore: topScore ?? null
      })
    );
  }
};
