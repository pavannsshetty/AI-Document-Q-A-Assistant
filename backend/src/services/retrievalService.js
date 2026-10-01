import { env } from '../config/env.js';
import { generateEmbedding } from './embeddingService.js';
import { searchVectors } from './qdrantService.js';

export const retrieveRelevantChunks = async ({
  question,
  documentId,
  userId,
  topK = env.topKChunks || 5,
  similarityThreshold = env.similarityThreshold ?? 0.35,
  options = {},
  dependencies = {}
}) => {
  const embedFn = dependencies.generateEmbedding || generateEmbedding;
  const searchFn = dependencies.searchVectors || searchVectors;

  const queryVector = await embedFn(question, options);

  const candidateLimit = Math.max(topK * 2, 8);
  const rawResults = await searchFn({
    queryVector,
    documentId,
    userId,
    limit: candidateLimit,
    options
  });

  const seenKeys = new Set();
  const normalizedTexts = new Set();
  const filteredChunks = [];

  for (const candidate of rawResults) {
    if (typeof candidate.score !== 'number' || candidate.score < similarityThreshold) {
      continue;
    }

    const cleanedText = String(candidate.text || '').trim();
    if (!cleanedText) {
      continue;
    }

    const chunkKey = `${candidate.documentId}:${candidate.chunkIndex}`;
    const normalizedTextKey = cleanedText.toLowerCase().replace(/\s+/g, ' ');

    if (seenKeys.has(chunkKey) || normalizedTexts.has(normalizedTextKey)) {
      continue;
    }

    seenKeys.add(chunkKey);
    normalizedTexts.add(normalizedTextKey);
    filteredChunks.push(candidate);

    if (filteredChunks.length >= topK) {
      break;
    }
  }

  return filteredChunks;
};
