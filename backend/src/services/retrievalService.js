import { env } from '../config/env.js';
import { generateEmbedding } from './embeddingService.js';
import {
  searchVectors,
  getDocumentChunksFromVectorStore
} from './qdrantService.js';
import {
  analyzeQuestionIntent,
  extractCandidateIdentityFromText,
  tokenizeText,
  stemToken
} from './localStoreService.js';
import { ragLogger } from '../utils/logger.js';

const selectRepresentativeDocumentChunks = (candidates, targetCount = 6) => {
  const valid = candidates
    .filter((c) => String(c.text || '').trim().length > 0)
    .sort((a, b) => Number(a.chunkIndex || 0) - Number(b.chunkIndex || 0));

  if (valid.length === 0) {
    return [];
  }

  if (valid.length <= targetCount) {
    return valid.map((chunk, idx) => ({
      ...chunk,
      score: Number(
        Math.max(Number(chunk.score || 0), idx === 0 ? 0.88 : 0.82).toFixed(4)
      )
    }));
  }

  const selectedIndices = new Set([0]);
  if (valid.length > 1) {
    selectedIndices.add(1);
  }

  const remainingSlots = Math.max(1, targetCount - selectedIndices.size);
  for (let i = 1; i <= remainingSlots; i += 1) {
    const sampleIdx = Math.min(
      valid.length - 1,
      Math.floor((i * (valid.length - 1)) / remainingSlots)
    );
    selectedIndices.add(sampleIdx);
  }

  return Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .slice(0, targetCount)
    .map((idx, pos) => {
      const chunk = valid[idx];
      const baseScore = pos === 0 ? 0.88 : Number((0.84 - pos * 0.02).toFixed(4));
      return {
        ...chunk,
        score: Number(Math.max(Number(chunk.score || 0), baseScore).toFixed(4))
      };
    });
};

export const retrieveRelevantChunks = async ({
  question,
  documentId,
  userId,
  topK = env.topKChunks || 5,
  similarityThreshold = env.similarityThreshold ?? 0.25,
  options = {},
  dependencies = {}
}) => {
  const embedFn = dependencies.generateEmbedding || generateEmbedding;
  const searchFn = dependencies.searchVectors || searchVectors;
  const hasCustomSearchMock = Boolean(dependencies.searchVectors);

  const intent = analyzeQuestionIntent(question);
  const queryVector = await embedFn(question, options);

  const candidateLimit = Math.max(topK * 3, 12);
  const vectorSearchResults = await searchFn({
    queryVector,
    documentId,
    userId,
    limit: candidateLimit,
    options
  });

  const mergedByChunkKey = new Map();

  for (const hit of vectorSearchResults) {
    const key = `${hit.documentId}:${hit.chunkIndex}`;
    mergedByChunkKey.set(key, { ...hit });
  }

  if (!hasCustomSearchMock || dependencies.getDocumentChunks) {
    const scrollFn =
      dependencies.getDocumentChunks || getDocumentChunksFromVectorStore;
    const allDocChunks = await scrollFn({
      documentId,
      userId,
      limit: 150,
      options
    }).catch(() => []);

    for (const chunk of allDocChunks) {
      const key = `${chunk.documentId}:${chunk.chunkIndex}`;
      if (!mergedByChunkKey.has(key)) {
        mergedByChunkKey.set(key, { ...chunk, score: 0 });
      }
    }
  }

  const authorizedCandidates = Array.from(mergedByChunkKey.values()).filter(
    (candidate) => {
      if (userId && candidate.userId && String(candidate.userId) !== String(userId)) {
        return false;
      }
      if (
        documentId &&
        candidate.documentId &&
        String(candidate.documentId) !== String(documentId)
      ) {
        return false;
      }
      return String(candidate.text || '').trim().length > 0;
    }
  );

  if (intent.isOverviewQuery) {
    const overviewTargetCount = Math.max(topK, 6);
    const representativeChunks = selectRepresentativeDocumentChunks(
      authorizedCandidates,
      overviewTargetCount
    );

    ragLogger.logRetrieval({
      documentId,
      userId,
      filterApplied: Boolean(documentId && userId),
      rawResultCount: vectorSearchResults.length,
      filteredResultCount: representativeChunks.length,
      scores: representativeChunks.map((c) => c.score),
      filenames: Array.from(new Set(representativeChunks.map((c) => c.filename))),
      chunkIndices: representativeChunks.map((c) => c.chunkIndex),
      retrievalMode: 'document_overview_representative'
    });

    return representativeChunks;
  }

  const scoredCandidates = [];
  const stemmedSpecificKeywords = intent.specificKeywords.map(stemToken);

  for (const candidate of authorizedCandidates) {
    const cleanedText = String(candidate.text || '').trim();
    const rawScore = typeof candidate.score === 'number' ? candidate.score : 0;
    const lowerText = cleanedText.toLowerCase();
    const rawChunkTokens = tokenizeText(cleanedText);
    const chunkTokens = new Set(rawChunkTokens);
    const stemmedChunkTokens = new Set(rawChunkTokens.map(stemToken));

    let directKeywordMatches = 0;
    let directTokenHitCount = 0;
    for (let k = 0; k < intent.specificKeywords.length; k += 1) {
      const kw = intent.specificKeywords[k];
      const kwStem = stemmedSpecificKeywords[k];
      if (
        chunkTokens.has(kw) ||
        stemmedChunkTokens.has(kwStem) ||
        lowerText.includes(kw) ||
        (kwStem.length >= 3 && lowerText.includes(kwStem))
      ) {
        directKeywordMatches += 1;
        for (const t of rawChunkTokens) {
          if (t === kw || stemToken(t) === kwStem) {
            directTokenHitCount += 1;
          }
        }
      }
    }

    let expandedMatches = 0;
    for (const term of intent.expandedSearchTerms) {
      const termStem = stemToken(term);
      if (
        chunkTokens.has(term) ||
        stemmedChunkTokens.has(termStem) ||
        lowerText.includes(term)
      ) {
        expandedMatches += 1;
      }
    }

    const identityInfo = extractCandidateIdentityFromText(cleanedText);
    const hasPersonalResumeHeader =
      Boolean(identityInfo.candidateName) ||
      Boolean(identityInfo.email) ||
      Boolean(identityInfo.phone);

    const isHeaderIdentityMatch =
      (intent.isPureIdentityQuery &&
        (Boolean(identityInfo.candidateName) ||
          (Number(candidate.chunkIndex) === 0 && hasPersonalResumeHeader))) ||
      (intent.queryType === 'email' && Boolean(identityInfo.email)) ||
      (intent.queryType === 'phone' && Boolean(identityInfo.phone));

    let effectiveScore = rawScore;
    let matchedByHybrid = false;

    if (isHeaderIdentityMatch) {
      effectiveScore = Math.max(
        rawScore,
        identityInfo.candidateName || identityInfo.email || identityInfo.phone
          ? 0.92
          : 0.85
      );
      matchedByHybrid = true;
    } else if (directKeywordMatches > 0 || expandedMatches > 0) {
      const densityBonus = Math.min(0.08, Math.max(0, directTokenHitCount - 1) * 0.02);
      const lexicalBoost = Math.min(
        0.42,
        directKeywordMatches * 0.18 + expandedMatches * 0.06 + densityBonus
      );
      effectiveScore = Math.max(
        rawScore,
        Math.min(0.95, Math.max(similarityThreshold, 0.52) + lexicalBoost)
      );
      matchedByHybrid = true;
    } else if (
      intent.specificKeywords.length > 0 &&
      rawScore < Math.max(similarityThreshold, 0.68)
    ) {
      continue;
    } else if (intent.isPureIdentityQuery && !hasPersonalResumeHeader) {
      continue;
    }

    if (effectiveScore < similarityThreshold) {
      continue;
    }

    scoredCandidates.push({
      ...candidate,
      score: Number(effectiveScore.toFixed(4)),
      _matchedByHybrid: matchedByHybrid
    });
  }

  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return Number(a.chunkIndex || 0) - Number(b.chunkIndex || 0);
  });

  const seenKeys = new Set();
  const normalizedTexts = new Set();
  const filteredChunks = [];

  for (const candidate of scoredCandidates) {
    const chunkKey = `${candidate.documentId}:${candidate.chunkIndex}`;
    const normalizedTextKey = String(candidate.text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    if (seenKeys.has(chunkKey) || normalizedTexts.has(normalizedTextKey)) {
      continue;
    }

    seenKeys.add(chunkKey);
    normalizedTexts.add(normalizedTextKey);

    const { _matchedByHybrid, ...cleanCandidate } = candidate;
    filteredChunks.push(cleanCandidate);

    if (filteredChunks.length >= topK) {
      break;
    }
  }

  ragLogger.logRetrieval({
    documentId,
    userId,
    filterApplied: Boolean(documentId && userId),
    rawResultCount: vectorSearchResults.length,
    filteredResultCount: filteredChunks.length,
    scores: filteredChunks.map((c) => c.score),
    filenames: Array.from(new Set(filteredChunks.map((c) => c.filename))),
    chunkIndices: filteredChunks.map((c) => c.chunkIndex),
    retrievalMode: intent.isPureIdentityQuery
      ? 'hybrid_identity'
      : 'hybrid_semantic_lexical'
  });

  if (filteredChunks.length === 0) {
    const topRawScore =
      vectorSearchResults.length > 0 ? vectorSearchResults[0].score : null;
    ragLogger.logFallbackReason({
      documentId,
      reason:
        vectorSearchResults.length === 0
          ? 'NO_VECTORS_FOUND_FOR_DOCUMENT'
          : 'NO_CHUNKS_PASSED_HYBRID_RELEVANCE_FILTER',
      questionLength: String(question || '').length,
      topScore: topRawScore
    });
  }

  return filteredChunks;
};
