import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {
  validateRegisterInput,
  validateLoginInput,
  validateChatInput,
  validateObjectId
} from '../src/middleware/validateMiddleware.js';
import { validateUploadedFileMeta } from '../src/middleware/uploadMiddleware.js';
import { signUserToken } from '../src/controllers/authController.js';
import { verifyTokenString } from '../src/middleware/authMiddleware.js';
import {
  cleanExtractedText,
  parseTxtContent
} from '../src/services/documentParserService.js';
import {
  splitTextIntoChunks,
  createDocumentChunks
} from '../src/services/chunkingService.js';
import {
  generateEmbedding,
  generateEmbeddingsForChunks
} from '../src/services/embeddingService.js';
import {
  initUploadProgress,
  updateUploadProgress,
  getUploadProgress
} from '../src/services/uploadProgressService.js';
import {
  ensureCollectionExists,
  upsertDocumentChunks,
  searchVectors,
  deleteDocumentVectors
} from '../src/services/qdrantService.js';
import { retrieveRelevantChunks } from '../src/services/retrievalService.js';
import { generateChatResponse } from '../src/services/ollamaService.js';
import {
  answerQuestionWithRag,
  formatSourceReferences
} from '../src/services/ragService.js';
import { NOT_FOUND_MESSAGE } from '../src/prompts/ragPrompt.js';

test('1. User registration validation and bcrypt password hashing', async () => {
  const validInput = validateRegisterInput({
    name: '  Jane Doe ',
    email: 'JANE@Example.com ',
    password: 'StrongPassword123'
  });

  assert.equal(validInput.name, 'Jane Doe');
  assert.equal(validInput.email, 'jane@example.com');

  const hashed = await bcrypt.hash(validInput.password, 10);
  assert.notEqual(hashed, validInput.password);
  const matches = await bcrypt.compare('StrongPassword123', hashed);
  assert.equal(matches, true);

  assert.throws(() => {
    validateRegisterInput({ name: 'J', email: 'jane@example.com', password: '123456' });
  });
});

test('2. User login validation and credential verification', async () => {
  const loginData = validateLoginInput({
    email: 'USER@Domain.com',
    password: 'MySecretPassword'
  });
  assert.equal(loginData.email, 'user@domain.com');
  assert.equal(loginData.password, 'MySecretPassword');

  assert.throws(() => {
    validateLoginInput({ email: '', password: '' });
  });
});

test('3. JWT authentication token signing and verification', () => {
  const userId = '670f1234567890abcdef1234';
  const secret = 'unit_test_jwt_secret_key_12345';
  const token = signUserToken(userId, secret, '1h');
  const decoded = verifyTokenString(token, secret);

  assert.equal(decoded.userId, userId);

  assert.throws(() => {
    verifyTokenString('invalid.token.string', secret);
  });
});

test('4. Document upload file extension and MIME validation', () => {
  assert.equal(validateUploadedFileMeta('handbook.pdf', 'application/pdf'), 'pdf');
  assert.equal(
    validateUploadedFileMeta(
      'syllabus.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ),
    'docx'
  );
  assert.equal(validateUploadedFileMeta('notes.txt', 'text/plain'), 'txt');

  assert.throws(() => {
    validateUploadedFileMeta('malware.exe', 'application/octet-stream');
  });
});

test('5. PDF page-aware chunking and metadata preservation', () => {
  const simulatedPdfPages = [
    { page: 1, text: 'Course Overview: Computer Science 101 covers algorithms and data structures.' },
    { page: 4, text: 'Attendance Requirement: Students must maintain at least 85% attendance to qualify for final exams.' }
  ];

  const chunks = createDocumentChunks({
    pages: simulatedPdfPages,
    documentId: '670f1234567890abcdef1111',
    userId: '670f1234567890abcdef2222',
    filename: 'syllabus.pdf',
    chunkSize: 500,
    chunkOverlap: 50
  });

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].page, 1);
  assert.equal(chunks[1].page, 4);
  assert.equal(chunks[1].filename, 'syllabus.pdf');
});

test('6. DOCX text cleaning and null page metadata handling', () => {
  const cleaned = cleanExtractedText('Policy Document\r\n\r\n\r\nSection 1:   Remote Work');
  assert.equal(cleaned, 'Policy Document\n\nSection 1: Remote Work');

  const chunks = createDocumentChunks({
    pages: [{ page: null, text: cleaned }],
    documentId: '670f1234567890abcdef3333',
    userId: '670f1234567890abcdef2222',
    filename: 'policy.docx'
  });

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].page, null);
});

test('7. TXT extraction and parsing', () => {
  const parsed = parseTxtContent('  Hello RAG World!\r\nLine two with details.  ');
  assert.equal(parsed.fullText, 'Hello RAG World!\nLine two with details.');
  assert.equal(parsed.pages.length, 1);
  assert.equal(parsed.pages[0].page, null);
  assert.equal(parsed.extractedTextLength, parsed.fullText.length);
});

test('8. Text chunking with configurable size and overlap', () => {
  const longText =
    'Sentence one explains the architecture. Sentence two describes local embeddings in detail. Sentence three covers Qdrant vector search. Sentence four explains Ollama generation.';
  const chunks = splitTextIntoChunks(longText, {
    chunkSize: 80,
    chunkOverlap: 20
  });

  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 80);
  }
});

test('9. Ollama embedding generation via local HTTP endpoint', async () => {
  const mockFetch = async (url, init) => {
    assert.ok(url.endsWith('/api/embed'));
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'nomic-embed-text');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: [[0.12, -0.34, 0.56, 0.78]]
      })
    };
  };

  const vector = await generateEmbedding('What is the attendance requirement?', {
    ollamaUrl: 'http://localhost:11434',
    model: 'nomic-embed-text',
    fetchImpl: mockFetch
  });

  assert.deepEqual(vector, [0.12, -0.34, 0.56, 0.78]);
});

test('10. Qdrant collection auto-creation and vector storage', async () => {
  const calls = [];
  const mockFetch = async (url, init) => {
    calls.push({ url, method: init.method });
    if (init.method === 'GET' && url.includes('/collections/')) {
      return { ok: false, status: 404, text: async () => 'Not found' };
    }
    if (init.method === 'PUT' && !url.includes('/points')) {
      return { ok: true, status: 200, json: async () => ({ result: true }) };
    }
    if (init.method === 'PUT' && url.includes('/points')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const chunks = [
    {
      documentId: 'doc-1',
      userId: 'user-1',
      filename: 'handbook.pdf',
      page: 2,
      chunkIndex: 0,
      text: 'Attendance requirement is 85%.'
    }
  ];
  const vectors = [[0.1, 0.2, 0.3, 0.4]];

  const result = await upsertDocumentChunks({
    chunks,
    vectors,
    options: {
      qdrantUrl: 'http://localhost:6333',
      collectionName: 'test_collection',
      fetchImpl: mockFetch
    }
  });

  assert.equal(result.storedCount, 1);
  assert.equal(result.dimension, 4);
  assert.equal(calls.length, 3);
});

test('11. Question embedding and Qdrant similarity search with ownership filter', async () => {
  let capturedFilter = null;
  const mockFetch = async (url, init) => {
    if (init.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { config: { params: { vectors: { size: 4 } } } }
        })
      };
    }
    const parsedBody = JSON.parse(init.body);
    capturedFilter = parsedBody.filter;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          {
            id: 'point-1',
            score: 0.89,
            payload: {
              documentId: 'doc-100',
              userId: 'user-500',
              filename: 'syllabus.pdf',
              page: 4,
              chunkIndex: 12,
              text: 'Students must maintain 85% attendance.'
            }
          }
        ]
      })
    };
  };

  const results = await searchVectors({
    queryVector: [0.1, 0.2, 0.3, 0.4],
    documentId: 'doc-100',
    userId: 'user-500',
    limit: 5,
    options: {
      qdrantUrl: 'http://localhost:6333',
      collectionName: 'test_collection',
      fetchImpl: mockFetch
    }
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].page, 4);
  assert.equal(results[0].chunkIndex, 12);
  assert.equal(capturedFilter.must.length, 2);
});

test('12. Retrieval threshold filtering and deduplication', async () => {
  const retrieved = await retrieveRelevantChunks({
    question: 'What is the attendance requirement?',
    documentId: 'doc-100',
    userId: 'user-500',
    similarityThreshold: 0.5,
    topK: 4,
    dependencies: {
      generateEmbedding: async () => [0.1, 0.2, 0.3],
      searchVectors: async () => [
        {
          documentId: 'doc-100',
          userId: 'user-500',
          filename: 'syllabus.pdf',
          page: 4,
          chunkIndex: 12,
          score: 0.89,
          text: 'Students must maintain 85% attendance.'
        },
        {
          documentId: 'doc-100',
          userId: 'user-500',
          filename: 'syllabus.pdf',
          page: 4,
          chunkIndex: 12,
          score: 0.88,
          text: 'Students must maintain 85% attendance.'
        },
        {
          documentId: 'doc-100',
          userId: 'user-500',
          filename: 'syllabus.pdf',
          page: 9,
          chunkIndex: 25,
          score: 0.21,
          text: 'Cafeteria hours are 8am to 5pm.'
        }
      ]
    }
  });

  assert.equal(retrieved.length, 1);
  assert.equal(retrieved[0].chunkIndex, 12);
});

test('13. Ollama RAG answer generation and fallback when no context matches', async () => {
  let llmCalled = false;
  const noMatchResult = await answerQuestionWithRag({
    question: 'What is the cafeteria menu?',
    documentId: 'doc-100',
    userId: 'user-500',
    dependencies: {
      retrieveRelevantChunks: async () => [],
      generateChatResponse: async () => {
        llmCalled = true;
        return 'Should not be called';
      }
    }
  });

  assert.equal(llmCalled, false);
  assert.equal(noMatchResult.answer, NOT_FOUND_MESSAGE);
  assert.deepEqual(noMatchResult.sources, []);

  const matchResult = await answerQuestionWithRag({
    question: 'What is the attendance requirement?',
    documentId: 'doc-100',
    userId: 'user-500',
    dependencies: {
      retrieveRelevantChunks: async () => [
        {
          documentId: 'doc-100',
          filename: 'syllabus.pdf',
          page: 4,
          chunkIndex: 12,
          score: 0.89123,
          text: 'The attendance requirement is 85% minimum.'
        }
      ],
      generateChatResponse: async ({ userPrompt }) => {
        assert.ok(userPrompt.includes('85% minimum'));
        return 'According to syllabus.pdf (Page 4), the attendance requirement is at least 85%.';
      }
    }
  });

  assert.ok(matchResult.answer.includes('85%'));
  assert.equal(matchResult.sources.length, 1);
  assert.equal(matchResult.sources[0].page, 4);
  assert.equal(matchResult.sources[0].score, 0.8912);
});

test('14. Source reference formatting and Qdrant vector deletion on document delete', async () => {
  const sources = formatSourceReferences([
    {
      documentId: 'doc-100',
      filename: 'notes.txt',
      page: null,
      chunkIndex: 3,
      score: 0.7654321
    }
  ]);

  assert.equal(sources[0].page, null);
  assert.equal(sources[0].chunkIndex, 3);
  assert.equal(sources[0].score, 0.7654);

  let deleteCalled = false;
  const mockFetch = async (url, init) => {
    if (init.method === 'GET') {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (init.method === 'POST' && url.includes('/points/delete')) {
      deleteCalled = true;
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
    }
    return { ok: true, status: 200 };
  };

  const delRes = await deleteDocumentVectors({
    documentId: 'doc-100',
    userId: 'user-500',
    options: {
      qdrantUrl: 'http://localhost:6333',
      collectionName: 'test_collection',
      fetchImpl: mockFetch
    }
  });

  assert.equal(delRes.deleted, true);
  assert.equal(deleteCalled, true);
});

test('15. Chat input validation and unauthorized ObjectId protection', () => {
  assert.throws(() => {
    validateChatInput({
      documentId: '670f1234567890abcdef1234',
      question: '   '
    });
  });

  assert.throws(() => {
    validateObjectId('not-a-valid-mongo-id', 'documentId');
  });

  const validChat = validateChatInput({
    documentId: '670f1234567890abcdef1234',
    question: 'What is the grading policy?'
  });
  assert.equal(validChat.question, 'What is the grading policy?');
});

test('16. Real-time upload and indexing progress tracking with user isolation', async () => {
  const uploadId = 'upload_test_123';
  const ownerId = '670f1234567890abcdef1111';
  const otherUserId = '670f1234567890abcdef9999';

  initUploadProgress({
    uploadId,
    userId: ownerId,
    filename: 'handbook.pdf',
    fileSize: 204800
  });

  const initialState = getUploadProgress(uploadId, ownerId);
  assert.equal(initialState.stage, 'uploading');
  assert.equal(initialState.percent, 15);
  assert.equal(getUploadProgress(uploadId, otherUserId), null);

  const progressEvents = [];
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] })
  });

  const chunks = [{ text: 'Chunk A' }, { text: 'Chunk B' }, { text: 'Chunk C' }];
  await generateEmbeddingsForChunks(chunks, {
    fetchImpl: mockFetch,
    onProgress: (processedCount, totalCount) => {
      const percent = 45 + Math.round((processedCount / totalCount) * 40);
      progressEvents.push({ processedCount, totalCount, percent });
      updateUploadProgress(uploadId, {
        stage: 'embedding',
        percent,
        processedChunks: processedCount,
        totalChunks: totalCount
      });
    }
  });

  assert.equal(progressEvents.length, 3);
  assert.equal(progressEvents[2].processedCount, 3);

  const afterEmbedding = getUploadProgress(uploadId, ownerId);
  assert.equal(afterEmbedding.stage, 'embedding');
  assert.equal(afterEmbedding.processedChunks, 3);
  assert.equal(afterEmbedding.totalChunks, 3);
  assert.equal(afterEmbedding.percent, 85);
});
