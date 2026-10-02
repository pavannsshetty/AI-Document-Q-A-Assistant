import {
  RAG_SYSTEM_PROMPT,
  RAG_OVERVIEW_SYSTEM_PROMPT,
  NOT_FOUND_MESSAGE,
  buildRagUserPrompt,
  buildRagOverviewUserPrompt
} from '../prompts/ragPrompt.js';
import { retrieveRelevantChunks } from './retrievalService.js';
import { generateChatResponse } from './ollamaService.js';
import {
  analyzeQuestionIntent,
  extractCandidateIdentityFromText
} from './localStoreService.js';
import { AppError } from '../utils/AppError.js';
import { ragLogger } from '../utils/logger.js';

export const formatContextFromChunks = (chunks) => {
  return chunks
    .map((chunk, idx) => {
      const pageLabel =
        chunk.page !== null && chunk.page !== undefined
          ? `Page ${chunk.page}`
          : 'Page not available';
      const identity = extractCandidateIdentityFromText(chunk.text);
      const identityTag = identity.candidateName
        ? ` | Candidate/Person Name: ${identity.candidateName}`
        : '';
      return `[Excerpt ${idx + 1} | Document: ${chunk.filename} | ${pageLabel} | Chunk #${chunk.chunkIndex}${identityTag}]\n${chunk.text}`;
    })
    .join('\n\n---\n\n');
};

export const formatSourceReferences = (chunks) => {
  return chunks.map((chunk) => ({
    documentId: String(chunk.documentId),
    filename: String(chunk.filename),
    page:
      chunk.page !== null && chunk.page !== undefined ? Number(chunk.page) : null,
    chunkIndex: Number(chunk.chunkIndex),
    score: Number(Number(chunk.score || 0).toFixed(4))
  }));
};

const isNotFoundResponse = (text) => {
  const normalized = String(text || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  return (
    normalized === "i couldn't find this information in the uploaded document" ||
    normalized === "i couldn't find this information in the uploaded documents"
  );
};

export const answerQuestionWithRag = async ({
  question,
  documentId,
  userId,
  documentMeta = null,
  options = {},
  dependencies = {}
}) => {
  const retrieveFn = dependencies.retrieveRelevantChunks || retrieveRelevantChunks;
  const chatFn = dependencies.generateChatResponse || generateChatResponse;
  const intent = analyzeQuestionIntent(question);

  const relevantChunks = await retrieveFn({
    question,
    documentId,
    userId,
    options,
    dependencies
  });

  if (!Array.isArray(relevantChunks) || relevantChunks.length === 0) {
    if (
      intent.isOverviewQuery &&
      documentMeta &&
      (Number(documentMeta.chunkCount || 0) > 0 ||
        Number(documentMeta.extractedTextLength || 0) > 0)
    ) {
      throw new AppError(
        'Document chunks are missing or unavailable in the vector store. Please click "Reindex" on this document to reprocess its contents.',
        422,
        'DOCUMENT_TEXT_UNAVAILABLE'
      );
    }

    return {
      answer: NOT_FOUND_MESSAGE,
      sources: []
    };
  }

  const contextBlocks = formatContextFromChunks(relevantChunks);

  const resolvedMeta = {
    filename:
      documentMeta?.filename || relevantChunks[0]?.filename || 'Uploaded Document',
    fileType: documentMeta?.fileType || 'document',
    chunkCount: documentMeta?.chunkCount || relevantChunks.length
  };

  const systemPrompt = intent.isOverviewQuery
    ? RAG_OVERVIEW_SYSTEM_PROMPT
    : RAG_SYSTEM_PROMPT;

  const userPrompt = intent.isOverviewQuery
    ? buildRagOverviewUserPrompt({
        contextBlocks,
        question,
        documentMeta: resolvedMeta,
        queryType: intent.queryType
      })
    : buildRagUserPrompt(contextBlocks, question);

  const rawAnswer = await chatFn({
    systemPrompt,
    userPrompt,
    options
  });

  if (isNotFoundResponse(rawAnswer)) {
    ragLogger.logFallbackReason({
      documentId,
      reason: 'LLM_DETERMINED_ANSWER_ABSENT_FROM_RETRIEVED_CONTEXT',
      questionLength: String(question || '').length,
      topScore: relevantChunks[0]?.score ?? null
    });
    return {
      answer: NOT_FOUND_MESSAGE,
      sources: []
    };
  }

  const answer = String(rawAnswer)
    .replace(/\s*\[Source:[^\]]*\]\.?\s*$/i, '')
    .trim();

  const sources = formatSourceReferences(relevantChunks);

  return {
    answer,
    sources
  };
};
