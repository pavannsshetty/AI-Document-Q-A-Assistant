import {
  RAG_SYSTEM_PROMPT,
  NOT_FOUND_MESSAGE,
  buildRagUserPrompt
} from '../prompts/ragPrompt.js';
import { retrieveRelevantChunks } from './retrievalService.js';
import { generateChatResponse } from './ollamaService.js';

export const formatContextFromChunks = (chunks) => {
  return chunks
    .map((chunk, idx) => {
      const pageLabel =
        chunk.page !== null && chunk.page !== undefined
          ? `Page ${chunk.page}`
          : 'Page not available';
      return `[Excerpt ${idx + 1} | Document: ${chunk.filename} | ${pageLabel} | Chunk #${chunk.chunkIndex}]\n${chunk.text}`;
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

export const answerQuestionWithRag = async ({
  question,
  documentId,
  userId,
  options = {},
  dependencies = {}
}) => {
  const retrieveFn = dependencies.retrieveRelevantChunks || retrieveRelevantChunks;
  const chatFn = dependencies.generateChatResponse || generateChatResponse;

  const relevantChunks = await retrieveFn({
    question,
    documentId,
    userId,
    options,
    dependencies
  });

  if (!Array.isArray(relevantChunks) || relevantChunks.length === 0) {
    return {
      answer: NOT_FOUND_MESSAGE,
      sources: []
    };
  }

  const contextBlocks = formatContextFromChunks(relevantChunks);
  const userPrompt = buildRagUserPrompt(contextBlocks, question);

  const answer = await chatFn({
    systemPrompt: RAG_SYSTEM_PROMPT,
    userPrompt,
    options
  });

  const sources = formatSourceReferences(relevantChunks);

  return {
    answer,
    sources
  };
};
