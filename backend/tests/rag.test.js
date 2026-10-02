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
  parseTxtContent,
  parsePdfBuffer
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
  deleteDocumentVectors,
  getDocumentChunksFromVectorStore
} from '../src/services/qdrantService.js';
import { retrieveRelevantChunks } from '../src/services/retrievalService.js';
import { generateChatResponse } from '../src/services/ollamaService.js';
import {
  answerQuestionWithRag,
  formatSourceReferences
} from '../src/services/ragService.js';
import {
  extractCandidateIdentityFromText,
  analyzeQuestionIntent,
  synthesizeLocalExtractiveAnswer
} from '../src/services/localStoreService.js';
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

test('17. Resume text cleaning collapses spaced-out header names and rejects invalid PDF buffers', async () => {
  const spacedResumeHeader =
    'S H E T T Y   P A V A N\r\nshettypavan524@gmail.com | +91 9876543210\r\n\r\nEDUCATION\r\nB.E. in Computer Science';
  const cleaned = cleanExtractedText(spacedResumeHeader);
  assert.ok(cleaned.startsWith('SHETTY PAVAN\n'));
  assert.ok(cleaned.includes('shettypavan524@gmail.com'));

  const identity = extractCandidateIdentityFromText(cleaned);
  assert.equal(identity.candidateName, 'SHETTY PAVAN');
  assert.equal(identity.email, 'shettypavan524@gmail.com');

  await assert.rejects(
    async () => {
      await parsePdfBuffer(Buffer.from(''), 'empty.pdf');
    },
    (err) => err.code === 'EMPTY_PDF_FILE'
  );

  await assert.rejects(
    async () => {
      await parsePdfBuffer(Buffer.from('not a pdf header'), 'corrupted.pdf');
    },
    (err) => err.code === 'CORRUPTED_PDF'
  );
});

test('18. Hybrid identity retrieval returns ONLY the candidate name for "Tell me the name mentioned in PDF"', async () => {
  const resumeChunks = [
    {
      documentId: 'resume-doc-1',
      userId: 'user-shetty',
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 0,
      text: 'Pavan Kumar Shetty\nshettypavan524@gmail.com | +91-9876543210 | Bengaluru, India\n\nEDUCATION\nB.E. in Computer Science and Engineering — CGPA: 8.7'
    },
    {
      documentId: 'resume-doc-1',
      userId: 'user-shetty',
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 1,
      text: 'TECHNICAL SKILLS\nLanguages: JavaScript, Python, Java, C++\nFrameworks: React.js, Node.js, Express.js, Tailwind CSS\nDatabases: MongoDB, Qdrant, MySQL'
    },
    {
      documentId: 'resume-doc-1',
      userId: 'user-shetty',
      filename: 'Shettypavanresume.pdf',
      page: 2,
      chunkIndex: 2,
      text: 'PROJECTS\nAI Document Q&A Assistant: Built a full-stack local RAG pipeline using React, Node.js, MongoDB, Qdrant, and Ollama.'
    }
  ];

  const identityQueries = [
    'Tell me the name mentioned in PDF',
    'name of person in given file',
    'Who is the person in this resume?',
    "What is the candidate's full name?"
  ];

  for (const query of identityQueries) {
    const intent = analyzeQuestionIntent(query);
    assert.equal(intent.isPureIdentityQuery, true);
    assert.equal(intent.queryType, 'name');

    const retrieved = await retrieveRelevantChunks({
      question: query,
      documentId: 'resume-doc-1',
      userId: 'user-shetty',
      similarityThreshold: 0.25,
      topK: 3,
      dependencies: {
        generateEmbedding: async () => [0.05, 0.05, 0.05],
        searchVectors: async () => [
          { ...resumeChunks[2], score: 0.31 },
          { ...resumeChunks[0], score: 0.19 }
        ],
        getDocumentChunks: async () => resumeChunks
      }
    });

    assert.ok(retrieved.length >= 1);
    assert.equal(retrieved[0].chunkIndex, 0);

    const ragAnswer = await answerQuestionWithRag({
      question: query,
      documentId: 'resume-doc-1',
      userId: 'user-shetty',
      dependencies: {
        retrieveRelevantChunks: async () => retrieved,
        generateChatResponse: async ({ userPrompt }) =>
          synthesizeLocalExtractiveAnswer(userPrompt)
      }
    });

    assert.equal(ragAnswer.answer, 'Pavan Kumar Shetty');
    assert.equal(ragAnswer.answer.includes('shettypavan524@gmail.com'), false);
    assert.equal(ragAnswer.answer.includes('[Source:'), false);
    assert.equal(ragAnswer.sources[0].filename, 'Shettypavanresume.pdf');
    assert.equal(ragAnswer.sources[0].page, 1);
    assert.equal(ragAnswer.sources[0].chunkIndex, 0);
  }
});

test('19. Concise answers for email, technical skills, education, and project explanation queries', async () => {
  const resumeChunks = [
    {
      documentId: 'resume-doc-2',
      userId: 'user-shetty',
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 0,
      text: 'Pavan Kumar Shetty\nshettypavan524@gmail.com | +91-9876543210\n\nEDUCATION\nBachelor of Engineering in Computer Science, VTU (2021 - 2025), CGPA: 8.75'
    },
    {
      documentId: 'resume-doc-2',
      userId: 'user-shetty',
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 1,
      text: 'TECHNICAL SKILLS\nJavaScript, React.js, Node.js, Express.js, MongoDB, Qdrant, Ollama, Docker, Git'
    },
    {
      documentId: 'resume-doc-2',
      userId: 'user-shetty',
      filename: 'Shettypavanresume.pdf',
      page: 2,
      chunkIndex: 2,
      text: 'PROJECTS\n1. AI Document Q&A Assistant — Local RAG system with Ollama and Qdrant.\n2. Smart Campus Portal — Full-stack MERN web app.'
    }
  ];

  const emailRag = await answerQuestionWithRag({
    question: 'What is the email address?',
    documentId: 'resume-doc-2',
    userId: 'user-shetty',
    dependencies: {
      retrieveRelevantChunks: async () => [resumeChunks[0]],
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });
  assert.equal(emailRag.answer, 'shettypavan524@gmail.com');

  const skillsChunks = await retrieveRelevantChunks({
    question: 'What technical skills are mentioned?',
    documentId: 'resume-doc-2',
    userId: 'user-shetty',
    dependencies: {
      generateEmbedding: async () => [0.1, 0.2, 0.3],
      searchVectors: async () => [{ ...resumeChunks[1], score: 0.42 }],
      getDocumentChunks: async () => resumeChunks
    }
  });

  assert.ok(skillsChunks.some((c) => c.chunkIndex === 1));

  const skillsRag = await answerQuestionWithRag({
    question: 'What technical skills are mentioned?',
    documentId: 'resume-doc-2',
    userId: 'user-shetty',
    dependencies: {
      retrieveRelevantChunks: async () => skillsChunks,
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });

  assert.equal(
    skillsRag.answer,
    'JavaScript, React.js, Node.js, Express.js, MongoDB, Qdrant, Ollama, Docker, Git'
  );
  assert.equal(skillsRag.answer.includes('According to'), false);

  const educationRag = await answerQuestionWithRag({
    question: 'What is the education qualification?',
    documentId: 'resume-doc-2',
    userId: 'user-shetty',
    dependencies: {
      retrieveRelevantChunks: async () => [resumeChunks[0]],
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });
  assert.equal(
    educationRag.answer,
    'Bachelor of Engineering in Computer Science, VTU (2021 - 2025), CGPA: 8.75'
  );

  const projectsRag = await answerQuestionWithRag({
    question: 'Explain my projects',
    documentId: 'resume-doc-2',
    userId: 'user-shetty',
    dependencies: {
      retrieveRelevantChunks: async () => [resumeChunks[2]],
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });
  assert.ok(projectsRag.answer.includes('AI Document Q&A Assistant'));
  assert.ok(projectsRag.answer.includes('Smart Campus Portal'));
});

test('20. Returns exact NOT_FOUND_MESSAGE when asked about information absent from the resume', async () => {
  const resumeChunks = [
    {
      documentId: 'resume-doc-3',
      userId: 'user-shetty',
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 0,
      text: 'Shetty Pavan\nshettypavan524@gmail.com\nEDUCATION: B.E. Computer Science'
    }
  ];

  const retrieved = await retrieveRelevantChunks({
    question: 'What is the candidate passport number and blood group?',
    documentId: 'resume-doc-3',
    userId: 'user-shetty',
    dependencies: {
      generateEmbedding: async () => [0.01, 0.02, 0.03],
      searchVectors: async () => [{ ...resumeChunks[0], score: 0.31 }],
      getDocumentChunks: async () => resumeChunks
    }
  });

  assert.equal(retrieved.length, 0);

  const ragResult = await answerQuestionWithRag({
    question: 'What is the candidate passport number and blood group?',
    documentId: 'resume-doc-3',
    userId: 'user-shetty',
    dependencies: {
      retrieveRelevantChunks: async () => retrieved,
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });

  assert.equal(ragResult.answer, NOT_FOUND_MESSAGE);
  assert.deepEqual(ragResult.sources, []);
});

test('21. Reindexing replaces existing document chunks without creating duplicates', async () => {
  const docId = 'doc-reindex-test-1';
  const userId = 'user-reindex-test-1';

  const initialChunks = [
    {
      documentId: docId,
      userId,
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 0,
      text: 'Initial chunk 0'
    },
    {
      documentId: docId,
      userId,
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 1,
      text: 'Initial chunk 1'
    }
  ];

  await upsertDocumentChunks({
    chunks: initialChunks,
    vectors: [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ]
  });

  const reindexedChunks = [
    {
      documentId: docId,
      userId,
      filename: 'Shettypavanresume.pdf',
      page: 1,
      chunkIndex: 0,
      text: 'Updated chunk 0 with Shetty Pavan full resume text'
    }
  ];

  await upsertDocumentChunks({
    chunks: reindexedChunks,
    vectors: [[0.7, 0.8, 0.9]],
    options: { replaceExisting: true }
  });

  const stored = await getDocumentChunksFromVectorStore({
    documentId: docId,
    userId
  });

  assert.equal(stored.length, 1);
  assert.equal(stored[0].text, 'Updated chunk 0 with Shetty Pavan full resume text');

  await deleteDocumentVectors({ documentId: docId, userId });
});

test('22. SQL Interview PDF overview, topic list, joins explanation, and candidate name fallback', async () => {
  const sqlDocId = 'sql-interview-doc-119';
  const userId = 'user-sql-tester';
  const sqlFilename = 'Real SQL Interview Questions.pdf';
  const sqlDocumentMeta = {
    filename: sqlFilename,
    fileType: 'pdf',
    fileSize: 4687134,
    chunkCount: 119,
    extractedTextLength: 82400
  };

  const sqlChunks = [
    {
      documentId: sqlDocId,
      userId,
      filename: sqlFilename,
      page: 1,
      chunkIndex: 0,
      text: 'Real SQL Interview Questions and Answers for Technical Interview Preparation\nTopics Covered: SQL Joins, Primary and Foreign Keys, Database Normalization, Indexing, Subqueries, and Transactions.'
    },
    {
      documentId: sqlDocId,
      userId,
      filename: sqlFilename,
      page: 4,
      chunkIndex: 15,
      text: '1. SQL Joins\nAn SQL JOIN clause combines rows from two or more tables based on a related column between them. Main types include INNER JOIN, LEFT JOIN, RIGHT JOIN, and FULL OUTER JOIN.'
    },
    {
      documentId: sqlDocId,
      userId,
      filename: sqlFilename,
      page: 12,
      chunkIndex: 45,
      text: '2. Database Normalization\nNormalization organizes relational database tables to reduce redundancy and dependency through 1NF, 2NF, 3NF, and BCNF.'
    },
    {
      documentId: sqlDocId,
      userId,
      filename: sqlFilename,
      page: 25,
      chunkIndex: 88,
      text: '3. Indexing and Query Optimization\nClustered and non-clustered indexes speed up data retrieval operations on database tables.'
    },
    {
      documentId: sqlDocId,
      userId,
      filename: sqlFilename,
      page: 34,
      chunkIndex: 118,
      text: '4. Transactions and ACID Properties\nAtomicity, Consistency, Isolation, and Durability guarantee reliable database transaction processing.'
    }
  ];

  const overviewQuestions = [
    'What is this uploaded PDF?',
    'What is this document about?',
    'Summarize this PDF.'
  ];

  for (const question of overviewQuestions) {
    const intent = analyzeQuestionIntent(question);
    assert.equal(intent.intentCategory, 'overview');
    assert.equal(intent.queryType, 'overview');
    assert.equal(intent.isOverviewQuery, true);

    const ragRes = await answerQuestionWithRag({
      question,
      documentId: sqlDocId,
      userId,
      documentMeta: sqlDocumentMeta,
      dependencies: {
        generateEmbedding: async () => [0.02, 0.03, 0.01],
        searchVectors: async () => [{ ...sqlChunks[3], score: 0.14 }],
        getDocumentChunks: async () => sqlChunks,
        generateChatResponse: async ({ userPrompt }) =>
          synthesizeLocalExtractiveAnswer(userPrompt)
      }
    });

    assert.notEqual(ragRes.answer, NOT_FOUND_MESSAGE);
    assert.ok(ragRes.answer.toLowerCase().includes('sql'));
    assert.ok(ragRes.answer.toLowerCase().includes('interview'));
    assert.ok(ragRes.sources.length >= 1);
    assert.equal(ragRes.sources[0].filename, sqlFilename);
  }

  const topicListIntent = analyzeQuestionIntent('List the main SQL topics covered.');
  assert.equal(topicListIntent.queryType, 'topic_list');
  assert.equal(topicListIntent.isOverviewQuery, true);

  const topicListRes = await answerQuestionWithRag({
    question: 'List the main SQL topics covered.',
    documentId: sqlDocId,
    userId,
    documentMeta: sqlDocumentMeta,
    dependencies: {
      generateEmbedding: async () => [0.02, 0.03, 0.01],
      searchVectors: async () => [],
      getDocumentChunks: async () => sqlChunks,
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });

  assert.notEqual(topicListRes.answer, NOT_FOUND_MESSAGE);
  assert.ok(topicListRes.answer.includes('- '));
  assert.ok(topicListRes.answer.toLowerCase().includes('joins'));
  assert.ok(topicListRes.answer.toLowerCase().includes('normalization'));

  const joinsRes = await answerQuestionWithRag({
    question: 'Explain joins based on this PDF.',
    documentId: sqlDocId,
    userId,
    documentMeta: sqlDocumentMeta,
    dependencies: {
      generateEmbedding: async () => [0.08, 0.12, 0.05],
      searchVectors: async () => [{ ...sqlChunks[0], score: 0.29 }],
      getDocumentChunks: async () => sqlChunks,
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });

  assert.notEqual(joinsRes.answer, NOT_FOUND_MESSAGE);
  assert.ok(joinsRes.answer.toLowerCase().includes('join'));
  assert.ok(joinsRes.answer.includes('INNER JOIN'));
  assert.ok(joinsRes.sources.some((s) => s.chunkIndex === 15));

  const candidateNameRes = await answerQuestionWithRag({
    question: "What is the candidate's name?",
    documentId: sqlDocId,
    userId,
    documentMeta: sqlDocumentMeta,
    dependencies: {
      generateEmbedding: async () => [0.01, 0.01, 0.01],
      searchVectors: async () => [{ ...sqlChunks[0], score: 0.22 }],
      getDocumentChunks: async () => sqlChunks,
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });

  assert.equal(candidateNameRes.answer, NOT_FOUND_MESSAGE);
  assert.deepEqual(candidateNameRes.sources, []);
});

test('23. Handles actual Real SQL Interview Questions.pdf with raw SQL queries without leaking SQL syntax as topics or names', async () => {
  const docId = 'ea8a66ad3b2ca41aafbe28bc';
  const userId = '242c62e1f020d22b583e8536';
  const filename = 'Real SQL Interview Questions.pdf';
  const documentMeta = {
    filename,
    fileType: 'pdf',
    fileSize: 4685548,
    chunkCount: 119,
    extractedTextLength: 87986
  };

  const realSqlChunks = [
    {
      documentId: docId,
      userId,
      filename,
      page: 1,
      chunkIndex: 0,
      text: "300 Real SQL Interview Questi ons\nAsked at PwC, Deloitte, EY, KPMG,\nTredence, Persistent Systems and\nAccenture & More.\nMedium to Advanced SQL Questions (01–300)\n1. Find the second highest salary from the Employee\ntable.\nSELECT MAX(salary) AS SecondHighestSalary\nFROM employees\nWHERE salary < (\nSELECT MAX(salary)\nFROM employees\n);\n2. Find duplicate records in a table.\nSELECT name, COUNT(*)\nFROM employees\nGROUP BY name\nHAVING COUNT(*) > 1;\n3. Retrieve employees who earn more than their\nmanager."
    },
    {
      documentId: docId,
      userId,
      filename,
      page: 2,
      chunkIndex: 1,
      text: "SELECT e.name AS Employee, e.salary, m.name AS\nManager, m.salary AS ManagerSalary\nFROM employees e\nJOIN employees m ON e.manager_id = m.id\nWHERE e.salary > m.salary;\n6. Get departments with no employees.\nSELECT d.department_name\nFROM departments d\nLEFT JOIN employees e ON d.department_id =\ne.department_id\nWHERE e.id IS NULL;"
    },
    {
      documentId: docId,
      userId,
      filename,
      page: 4,
      chunkIndex: 3,
      text: "10. Recursive query to find the full reporting chain for\neach employee.\nWITH RECURSIVE reporting_chain AS (\nSELECT id, name, manager_id, 1 AS level\nFROM employees\nWHERE manager_id IS NULL\nUNION ALL\nSELECT e.id, e.name, e.manager_id, rc.level + 1\nFROM employees e\nJOIN reporting_chain rc ON e.manager_id = rc.id\n)\nSELECT * FROM reporting_chain ORDER BY level, id;"
    },
    {
      documentId: docId,
      userId,
      filename,
      page: 5,
      chunkIndex: 4,
      text: "13. Compare two tables and find rows with differences\nin any column (all columns).\nSELECT *\nFROM table1 t1\nFULL OUTER JOIN table2 t2 ON t1.id = t2.id\nWHERE t1.col1 IS DISTINCT FROM t2.col1;\n14. Write a query to rank employees based on salary\nwith ties handled properly.\nSELECT name, salary,\nRANK() OVER (ORDER BY salary DESC) AS salary_rank\nFROM employees;"
    }
  ];

  const overviewPrompts = [
    'What is this uploaded PDF?',
    'What is this document about?',
    'Summarize this document.',
    'Give me an overview of this file.',
    'What can I learn from this document?',
    'What topics does this PDF cover?'
  ];

  for (const question of overviewPrompts) {
    const res = await answerQuestionWithRag({
      question,
      documentId: docId,
      userId,
      documentMeta,
      dependencies: {
        generateEmbedding: async () => [0.01, 0.02, 0.03],
        searchVectors: async () => [],
        getDocumentChunks: async () => realSqlChunks,
        generateChatResponse: async ({ userPrompt }) =>
          synthesizeLocalExtractiveAnswer(userPrompt)
      }
    });

    assert.notEqual(res.answer, NOT_FOUND_MESSAGE);
    assert.ok(res.answer.includes('300 Real SQL Interview Questions'));
    assert.equal(res.answer.includes('SELECT MAX(salary)'), false);
    assert.ok(res.sources.length >= 1);
  }

  const listPrompts = [
    'List the main SQL topics covered.',
    'Tell me the main sections in this PDF.'
  ];

  for (const question of listPrompts) {
    const res = await answerQuestionWithRag({
      question,
      documentId: docId,
      userId,
      documentMeta,
      dependencies: {
        generateEmbedding: async () => [0.01, 0.02, 0.03],
        searchVectors: async () => [],
        getDocumentChunks: async () => realSqlChunks,
        generateChatResponse: async ({ userPrompt }) =>
          synthesizeLocalExtractiveAnswer(userPrompt)
      }
    });

    assert.notEqual(res.answer, NOT_FOUND_MESSAGE);
    assert.ok(res.answer.includes('- SQL Joins'));
    assert.equal(res.answer.includes('SELECT MAX(salary)'), false);
  }

  const explainJoins = await answerQuestionWithRag({
    question: 'Explain joins based on this PDF.',
    documentId: docId,
    userId,
    documentMeta,
    dependencies: {
      generateEmbedding: async () => [0.01, 0.02, 0.03],
      searchVectors: async () => [],
      getDocumentChunks: async () => realSqlChunks,
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });

  assert.notEqual(explainJoins.answer, NOT_FOUND_MESSAGE);
  assert.ok(explainJoins.answer.includes('LEFT JOIN'));
  assert.ok(explainJoins.answer.includes('FULL OUTER JOIN'));

  const askCandidateName = await answerQuestionWithRag({
    question: "What is the candidate's name?",
    documentId: docId,
    userId,
    documentMeta,
    dependencies: {
      generateEmbedding: async () => [0.01, 0.02, 0.03],
      searchVectors: async () => [],
      getDocumentChunks: async () => realSqlChunks,
      generateChatResponse: async ({ userPrompt }) =>
        synthesizeLocalExtractiveAnswer(userPrompt)
    }
  });

  assert.equal(askCandidateName.answer, NOT_FOUND_MESSAGE);
  assert.deepEqual(askCandidateName.sources, []);
});
