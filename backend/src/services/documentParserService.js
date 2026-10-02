import fs from 'fs/promises';
import mammoth from 'mammoth';
import * as pdfParseModule from 'pdf-parse';
import { AppError } from '../utils/AppError.js';
import { ragLogger } from '../utils/logger.js';

const collapseSpacedOutWords = (line) => {
  const trimmed = line.trim();
  if (/^(?:[A-Za-z]\s+){3,}[A-Za-z]$/.test(trimmed)) {
    return trimmed
      .split(/\s{2,}/)
      .map((wordGroup) => wordGroup.replace(/\s+/g, ''))
      .join(' ');
  }
  return line;
};

export const cleanExtractedText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  const normalized = rawText
    .normalize('NFKC')
    .replace(/\0/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const cleanedLines = normalized
    .split('\n')
    .map((line) =>
      collapseSpacedOutWords(line)
        .replace(/[ \t]+/g, ' ')
        .replace(
          /\b([A-Za-z]{2,}(?:ti|fi))\s+(ons?|on|fy|fied|fic|al)\b/gi,
          '$1$2'
        )
        .trim()
    );

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const countAlphanumericChars = (text) => {
  const matches = String(text || '').match(/[a-zA-Z0-9]/g);
  return matches ? matches.length : 0;
};

export const parsePdfBuffer = async (buffer, filename = 'document.pdf') => {
  if (!buffer || buffer.length === 0) {
    throw new AppError(
      'PDF text extraction failed: Uploaded PDF file is empty.',
      422,
      'EMPTY_PDF_FILE'
    );
  }

  const headerPreview = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  if (!headerPreview.includes('%PDF-')) {
    throw new AppError(
      'PDF text extraction failed: The uploaded file is corrupted or is not a valid PDF document.',
      422,
      'CORRUPTED_PDF'
    );
  }

  let parsedPages = [];
  let fullText = '';

  try {
    if (typeof pdfParseModule.PDFParse === 'function') {
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const parser = new pdfParseModule.PDFParse({ data: uint8 });
      try {
        const result = await parser.getText();
        const rawPages = Array.isArray(result.pages) ? result.pages : [];
        parsedPages = rawPages
          .map((pageItem, idx) => ({
            page: typeof pageItem.num === 'number' ? pageItem.num : idx + 1,
            text: cleanExtractedText(pageItem.text || '')
          }))
          .filter((pageItem) => pageItem.text.length > 0);

        fullText =
          parsedPages.length > 0
            ? parsedPages.map((p) => p.text).join('\n\n')
            : cleanExtractedText(result.text || '');

        if (parsedPages.length === 0 && fullText.length > 0) {
          parsedPages.push({ page: 1, text: fullText });
        }
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
      }
    } else {
      const legacyPdfParse = pdfParseModule.default || pdfParseModule;
      if (typeof legacyPdfParse !== 'function') {
        throw new Error('Unsupported pdf-parse module export format');
      }

      const collectedPages = [];
      let currentPageNumber = 0;

      const options = {
        pagerender: async (pageData) => {
          currentPageNumber += 1;
          const pageIndex = currentPageNumber;
          const textContent = await pageData.getTextContent();
          let lastY = null;
          let pageText = '';
          for (const item of textContent.items) {
            const currentY = Array.isArray(item.transform) ? item.transform[5] : null;
            if (lastY === null || (currentY !== null && Math.abs(currentY - lastY) < 2)) {
              pageText += item.str + ' ';
            } else {
              pageText += '\n' + item.str + ' ';
            }
            lastY = currentY;
          }
          const cleaned = cleanExtractedText(pageText);
          if (cleaned.length > 0) {
            collectedPages.push({ page: pageIndex, text: cleaned });
          }
          return cleaned;
        }
      };

      const data = await legacyPdfParse(buffer, options);
      parsedPages = collectedPages;
      fullText =
        parsedPages.length > 0
          ? parsedPages.map((p) => p.text).join('\n\n')
          : cleanExtractedText(data.text || '');

      if (parsedPages.length === 0 && fullText.length > 0) {
        parsedPages.push({ page: 1, text: fullText });
      }
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      `PDF text extraction failed: ${error.message}`,
      422,
      'PDF_EXTRACTION_FAILED'
    );
  }

  const alphaCount = countAlphanumericChars(fullText);
  if (!fullText || alphaCount < 10) {
    throw new AppError(
      'PDF text extraction failed: This PDF contains little or no selectable text and appears to be a scanned image. Please upload a text-based PDF, DOCX, or TXT document.',
      422,
      'SCANNED_OR_EMPTY_PDF'
    );
  }

  ragLogger.logExtraction({
    filename,
    fileType: 'pdf',
    extractedTextLength: fullText.length,
    pageCount: parsedPages.length,
    previewText: fullText
  });

  return {
    fullText,
    pages: parsedPages,
    extractedTextLength: fullText.length
  };
};

export const parsePdfFile = async (filePath, filename = 'document.pdf') => {
  const buffer = await fs.readFile(filePath);
  return parsePdfBuffer(buffer, filename);
};

export const parseDocxBuffer = async (buffer, filename = 'document.docx') => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const fullText = cleanExtractedText(result.value || '');
    if (!fullText || countAlphanumericChars(fullText) === 0) {
      throw new AppError(
        'DOCX text extraction failed: No readable text was found in the uploaded DOCX file.',
        422,
        'EMPTY_DOCX_TEXT'
      );
    }

    ragLogger.logExtraction({
      filename,
      fileType: 'docx',
      extractedTextLength: fullText.length,
      pageCount: 1,
      previewText: fullText
    });

    return {
      fullText,
      pages: [{ page: null, text: fullText }],
      extractedTextLength: fullText.length
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      `DOCX text extraction failed: ${error.message}`,
      422,
      'DOCX_EXTRACTION_FAILED'
    );
  }
};

export const parseDocxFile = async (filePath, filename = 'document.docx') => {
  const buffer = await fs.readFile(filePath);
  return parseDocxBuffer(buffer, filename);
};

export const parseTxtContent = (rawContent, filename = 'document.txt') => {
  const fullText = cleanExtractedText(rawContent);

  if (fullText.length > 0) {
    ragLogger.logExtraction({
      filename,
      fileType: 'txt',
      extractedTextLength: fullText.length,
      pageCount: 1,
      previewText: fullText
    });
  }

  return {
    fullText,
    pages: fullText.length > 0 ? [{ page: null, text: fullText }] : [],
    extractedTextLength: fullText.length
  };
};

export const parseTxtFile = async (filePath, filename = 'document.txt') => {
  try {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    return parseTxtContent(rawContent, filename);
  } catch (error) {
    throw new AppError(
      `TXT text extraction failed: ${error.message}`,
      422,
      'TXT_EXTRACTION_FAILED'
    );
  }
};

export const parseDocument = async (filePath, fileType, filename = '') => {
  const normalizedType = String(fileType || '').toLowerCase();
  let parsedResult;

  if (normalizedType === 'pdf') {
    parsedResult = await parsePdfFile(filePath, filename || filePath);
  } else if (normalizedType === 'docx') {
    parsedResult = await parseDocxFile(filePath, filename || filePath);
  } else if (normalizedType === 'txt') {
    parsedResult = await parseTxtFile(filePath, filename || filePath);
  } else {
    throw new AppError(
      `Unsupported document format: ${fileType}. Allowed formats: PDF, DOCX, TXT.`,
      400,
      'INVALID_FILE_TYPE'
    );
  }

  if (!parsedResult.fullText || parsedResult.extractedTextLength === 0) {
    throw new AppError(
      'Document processing failed: No readable text was found in the uploaded file.',
      422,
      'EMPTY_DOCUMENT_TEXT'
    );
  }

  return parsedResult;
};
