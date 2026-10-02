import { env } from '../config/env.js';
import { ragLogger } from '../utils/logger.js';

export const splitTextIntoChunks = (text, options = {}) => {
  const chunkSize = options.chunkSize || env.chunkSize || 800;
  const chunkOverlap = Math.min(
    options.chunkOverlap !== undefined ? options.chunkOverlap : env.chunkOverlap || 150,
    Math.floor(chunkSize / 2)
  );

  const normalized = String(text || '').trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < normalized.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex < normalized.length) {
      const slice = normalized.slice(startIndex, endIndex);
      const minBreakOffset = Math.floor(chunkSize * 0.5);

      const paragraphBreak = slice.lastIndexOf('\n\n');
      const newlineBreak = slice.lastIndexOf('\n');
      const sentenceBreak = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! ')
      );
      const spaceBreak = slice.lastIndexOf(' ');

      if (paragraphBreak >= minBreakOffset) {
        endIndex = startIndex + paragraphBreak + 2;
      } else if (newlineBreak >= minBreakOffset) {
        endIndex = startIndex + newlineBreak + 1;
      } else if (sentenceBreak >= minBreakOffset) {
        endIndex = startIndex + sentenceBreak + 2;
      } else if (spaceBreak >= minBreakOffset) {
        endIndex = startIndex + spaceBreak + 1;
      }
    } else {
      endIndex = normalized.length;
    }

    const chunkText = normalized.slice(startIndex, endIndex).trim();
    if (chunkText.length > 0) {
      chunks.push(chunkText);
    }

    if (endIndex >= normalized.length) {
      break;
    }

    const nextStart = endIndex - chunkOverlap;
    startIndex = nextStart > startIndex ? nextStart : endIndex;
  }

  return chunks;
};

export const createDocumentChunks = ({
  pages,
  documentId,
  userId,
  filename,
  chunkSize,
  chunkOverlap
}) => {
  const resultChunks = [];
  let globalChunkIndex = 0;

  const pageEntries = Array.isArray(pages) ? pages : [];

  for (const pageEntry of pageEntries) {
    const pageNumber =
      typeof pageEntry.page === 'number' && !Number.isNaN(pageEntry.page)
        ? pageEntry.page
        : null;
    const textSegments = splitTextIntoChunks(pageEntry.text, {
      chunkSize,
      chunkOverlap
    });

    for (const segment of textSegments) {
      resultChunks.push({
        documentId: String(documentId),
        userId: String(userId),
        filename: String(filename),
        page: pageNumber,
        chunkIndex: globalChunkIndex,
        text: segment
      });
      globalChunkIndex += 1;
    }
  }

  ragLogger.logChunking({
    documentId,
    filename,
    chunkCount: resultChunks.length
  });

  return resultChunks;
};
