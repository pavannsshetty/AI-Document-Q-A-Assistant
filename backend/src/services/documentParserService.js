import fs from 'fs/promises';
import mammoth from 'mammoth';
import * as pdfParseModule from 'pdf-parse';
import { AppError } from '../utils/AppError.js';

export const cleanExtractedText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }
  return rawText
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const parsePdfBuffer = async (buffer) => {
  try {
    if (typeof pdfParseModule.PDFParse === 'function') {
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const parser = new pdfParseModule.PDFParse({ data: uint8 });
      try {
        const result = await parser.getText();
        const rawPages = Array.isArray(result.pages) ? result.pages : [];
        const pages = rawPages
          .map((pageItem, idx) => ({
            page: typeof pageItem.num === 'number' ? pageItem.num : idx + 1,
            text: cleanExtractedText(pageItem.text || '')
          }))
          .filter((pageItem) => pageItem.text.length > 0);

        const fullText =
          pages.length > 0
            ? pages.map((p) => p.text).join('\n\n')
            : cleanExtractedText(result.text || '');

        if (pages.length === 0 && fullText.length > 0) {
          pages.push({ page: 1, text: fullText });
        }

        return {
          fullText,
          pages,
          extractedTextLength: fullText.length
        };
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
      }
    }

    const legacyPdfParse = pdfParseModule.default || pdfParseModule;
    if (typeof legacyPdfParse === 'function') {
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
            if (lastY === item.transform[5] || lastY === null) {
              pageText += item.str + ' ';
            } else {
              pageText += '\n' + item.str + ' ';
            }
            lastY = item.transform[5];
          }
          const cleaned = cleanExtractedText(pageText);
          if (cleaned.length > 0) {
            collectedPages.push({ page: pageIndex, text: cleaned });
          }
          return cleaned;
        }
      };

      const data = await legacyPdfParse(buffer, options);
      const fullText =
        collectedPages.length > 0
          ? collectedPages.map((p) => p.text).join('\n\n')
          : cleanExtractedText(data.text || '');

      if (collectedPages.length === 0 && fullText.length > 0) {
        collectedPages.push({ page: 1, text: fullText });
      }

      return {
        fullText,
        pages: collectedPages,
        extractedTextLength: fullText.length
      };
    }

    throw new Error('Unsupported pdf-parse module export format');
  } catch (error) {
    throw new AppError(
      `PDF text extraction failed: ${error.message}`,
      422,
      'PDF_EXTRACTION_FAILED'
    );
  }
};

export const parsePdfFile = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  return parsePdfBuffer(buffer);
};

export const parseDocxBuffer = async (buffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const fullText = cleanExtractedText(result.value || '');
    return {
      fullText,
      pages: fullText.length > 0 ? [{ page: null, text: fullText }] : [],
      extractedTextLength: fullText.length
    };
  } catch (error) {
    throw new AppError(
      `DOCX text extraction failed: ${error.message}`,
      422,
      'DOCX_EXTRACTION_FAILED'
    );
  }
};

export const parseDocxFile = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  return parseDocxBuffer(buffer);
};

export const parseTxtContent = (rawContent) => {
  const fullText = cleanExtractedText(rawContent);
  return {
    fullText,
    pages: fullText.length > 0 ? [{ page: null, text: fullText }] : [],
    extractedTextLength: fullText.length
  };
};

export const parseTxtFile = async (filePath) => {
  try {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    return parseTxtContent(rawContent);
  } catch (error) {
    throw new AppError(
      `TXT text extraction failed: ${error.message}`,
      422,
      'TXT_EXTRACTION_FAILED'
    );
  }
};

export const parseDocument = async (filePath, fileType) => {
  const normalizedType = String(fileType || '').toLowerCase();
  let parsedResult;

  if (normalizedType === 'pdf') {
    parsedResult = await parsePdfFile(filePath);
  } else if (normalizedType === 'docx') {
    parsedResult = await parseDocxFile(filePath);
  } else if (normalizedType === 'txt') {
    parsedResult = await parseTxtFile(filePath);
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
