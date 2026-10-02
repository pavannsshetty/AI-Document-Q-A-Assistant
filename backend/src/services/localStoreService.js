import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { NOT_FOUND_MESSAGE } from '../prompts/ragPrompt.js';

const storeFilePath = path.join(env.uploadsDir, '.local_data_store.json');

const defaultData = () => ({
  users: [],
  documents: [],
  conversations: [],
  messages: [],
  vectors: []
});

const loadStore = () => {
  try {
    if (!fs.existsSync(storeFilePath)) {
      return defaultData();
    }
    const raw = fs.readFileSync(storeFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      vectors: Array.isArray(parsed.vectors) ? parsed.vectors : []
    };
  } catch {
    return defaultData();
  }
};

const saveStore = (data) => {
  try {
    if (!fs.existsSync(env.uploadsDir)) {
      fs.mkdirSync(env.uploadsDir, { recursive: true });
    }
    fs.writeFileSync(storeFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist local fallback store:', err.message);
  }
};

export const generateObjectIdHex = () => {
  return crypto.randomBytes(12).toString('hex');
};

export const localUserStore = {
  findByEmail: (email) => {
    const store = loadStore();
    const normalized = String(email || '').toLowerCase().trim();
    return store.users.find((u) => u.email === normalized) || null;
  },
  findById: (id) => {
    const store = loadStore();
    return store.users.find((u) => u._id === String(id)) || null;
  },
  create: async ({ name, email, password }) => {
    const store = loadStore();
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      _id: generateObjectIdHex(),
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password: hashedPassword,
      createdAt: now,
      updatedAt: now
    };
    store.users.push(newUser);
    saveStore(store);
    return newUser;
  }
};

export const localDocumentStore = {
  create: (docData) => {
    const store = loadStore();
    const now = new Date().toISOString();
    const newDoc = {
      _id: generateObjectIdHex(),
      userId: String(docData.userId),
      originalName: docData.originalName,
      storedName: docData.storedName || null,
      fileType: docData.fileType,
      fileSize: Number(docData.fileSize || 0),
      extractedTextLength: Number(docData.extractedTextLength || 0),
      extractedPages: Array.isArray(docData.extractedPages) ? docData.extractedPages : [],
      chunkCount: Number(docData.chunkCount || 0),
      processingStatus: docData.processingStatus || 'processing',
      errorMessage: docData.errorMessage || null,
      createdAt: now,
      updatedAt: now
    };
    store.documents.push(newDoc);
    saveStore(store);
    return newDoc;
  },
  update: (id, updates) => {
    const store = loadStore();
    const idx = store.documents.findIndex((d) => d._id === String(id));
    if (idx === -1) {
      return null;
    }
    store.documents[idx] = {
      ...store.documents[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveStore(store);
    return store.documents[idx];
  },
  findByUser: (userId, search = '') => {
    const store = loadStore();
    const query = String(search || '').trim().toLowerCase();
    return store.documents
      .filter((d) => {
        if (d.userId !== String(userId)) {
          return false;
        }
        if (query && !String(d.originalName || '').toLowerCase().includes(query)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findOne: (id, userId) => {
    const store = loadStore();
    return (
      store.documents.find(
        (d) => d._id === String(id) && d.userId === String(userId)
      ) || null
    );
  },
  deleteOne: (id, userId) => {
    const store = loadStore();
    store.documents = store.documents.filter(
      (d) => !(d._id === String(id) && d.userId === String(userId))
    );
    const removedConvIds = new Set(
      store.conversations
        .filter((c) => c.documentId === String(id) && c.userId === String(userId))
        .map((c) => c._id)
    );
    store.conversations = store.conversations.filter(
      (c) => !removedConvIds.has(c._id)
    );
    store.messages = store.messages.filter(
      (m) => !removedConvIds.has(m.conversationId)
    );
    saveStore(store);
  }
};

export const localConversationStore = {
  create: ({ userId, documentId, title }) => {
    const store = loadStore();
    const now = new Date().toISOString();
    const conv = {
      _id: generateObjectIdHex(),
      userId: String(userId),
      documentId: String(documentId),
      title: String(title || 'New Conversation'),
      createdAt: now,
      updatedAt: now
    };
    store.conversations.push(conv);
    saveStore(store);
    return conv;
  },
  update: (id, updates) => {
    const store = loadStore();
    const idx = store.conversations.findIndex((c) => c._id === String(id));
    if (idx === -1) {
      return null;
    }
    store.conversations[idx] = {
      ...store.conversations[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveStore(store);
    return store.conversations[idx];
  },
  findOne: (id, userId) => {
    const store = loadStore();
    return (
      store.conversations.find(
        (c) => c._id === String(id) && c.userId === String(userId)
      ) || null
    );
  },
  findByUser: (userId, documentId = '') => {
    const store = loadStore();
    return store.conversations
      .filter((c) => {
        if (c.userId !== String(userId)) {
          return false;
        }
        if (documentId && c.documentId !== String(documentId)) {
          return false;
        }
        return true;
      })
      .map((c) => {
        const doc = store.documents.find((d) => d._id === c.documentId) || null;
        return {
          ...c,
          documentObj: doc
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },
  deleteOne: (id, userId) => {
    const store = loadStore();
    store.conversations = store.conversations.filter(
      (c) => !(c._id === String(id) && c.userId === String(userId))
    );
    store.messages = store.messages.filter((m) => m.conversationId !== String(id));
    saveStore(store);
  }
};

export const localMessageStore = {
  create: ({ conversationId, role, content, sources = [] }) => {
    const store = loadStore();
    const msg = {
      _id: generateObjectIdHex(),
      conversationId: String(conversationId),
      role,
      content,
      sources: Array.isArray(sources) ? sources : [],
      createdAt: new Date().toISOString()
    };
    store.messages.push(msg);
    saveStore(store);
    return msg;
  },
  findByConversation: (conversationId) => {
    const store = loadStore();
    return store.messages
      .filter((m) => m.conversationId === String(conversationId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'what', 'which', 'who', 'whom', 'whose', 'this', 'that', 'these',
  'those', 'how', 'why', 'when', 'where', 'can', 'could', 'would', 'should',
  'do', 'does', 'did', 'has', 'have', 'had', 'about', 'into', 'through', 'during'
]);

export const tokenizeText = (text) => {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
};

export const generateLocalFallbackEmbedding = (text, dimensions = 256) => {
  const vector = new Array(dimensions).fill(0);
  const tokens = tokenizeText(text);

  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const hash = crypto.createHash('md5').update(token).digest();
    const idx1 = hash.readUInt16BE(0) % dimensions;
    const idx2 = hash.readUInt16BE(2) % dimensions;
    const sign = (hash[4] & 1) === 0 ? 1 : -1;
    vector[idx1] += 1.0;
    vector[idx2] += 0.5 * sign;

    if (i + 1 < tokens.length) {
      const bigram = `${token}_${tokens[i + 1]}`;
      const bHash = crypto.createHash('md5').update(bigram).digest();
      const bIdx = bHash.readUInt16BE(0) % dimensions;
      vector[bIdx] += 0.75;
    }
  }

  let norm = 0;
  for (let i = 0; i < dimensions; i += 1) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm) || 1;

  return vector.map((val) => Number((val / norm).toFixed(6)));
};

const computeCosineSimilarity = (vecA, vecB) => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
};

export const localVectorStore = {
  upsertPoints: (points) => {
    const store = loadStore();
    const incomingIds = new Set(points.map((p) => p.id));
    store.vectors = store.vectors.filter((p) => !incomingIds.has(p.id));
    store.vectors.push(...points);
    saveStore(store);
    return { storedCount: points.length };
  },
  searchPoints: ({ queryVector, documentId, userId, limit = 6 }) => {
    const store = loadStore();
    const candidates = store.vectors.filter((item) => {
      if (userId && String(item.payload?.userId) !== String(userId)) {
        return false;
      }
      if (documentId && String(item.payload?.documentId) !== String(documentId)) {
        return false;
      }
      return true;
    });

    const scored = candidates.map((item) => {
      const cosSim = computeCosineSimilarity(queryVector, item.vector);
      return {
        id: item.id,
        score: Number(Math.max(0, cosSim).toFixed(4)),
        documentId: item.payload?.documentId || String(documentId),
        userId: item.payload?.userId || String(userId),
        filename: item.payload?.filename || 'Document',
        page:
          item.payload?.page !== undefined && item.payload?.page !== null
            ? Number(item.payload.page)
            : null,
        chunkIndex:
          typeof item.payload?.chunkIndex === 'number'
            ? item.payload.chunkIndex
            : 0,
        text: item.payload?.text || ''
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  },
  getByDocument: ({ documentId, userId, limit = 100 }) => {
    const store = loadStore();
    return store.vectors
      .filter((item) => {
        if (userId && String(item.payload?.userId) !== String(userId)) {
          return false;
        }
        if (documentId && String(item.payload?.documentId) !== String(documentId)) {
          return false;
        }
        return true;
      })
      .map((item) => ({
        id: item.id,
        score: 0,
        documentId: item.payload?.documentId || String(documentId),
        userId: item.payload?.userId || String(userId),
        filename: item.payload?.filename || 'Document',
        page:
          item.payload?.page !== undefined && item.payload?.page !== null
            ? Number(item.payload.page)
            : null,
        chunkIndex:
          typeof item.payload?.chunkIndex === 'number'
            ? item.payload.chunkIndex
            : 0,
        text: item.payload?.text || ''
      }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .slice(0, limit);
  },
  deleteByDocument: ({ documentId, userId }) => {
    const store = loadStore();
    store.vectors = store.vectors.filter((item) => {
      const matchesDoc = String(item.payload?.documentId) === String(documentId);
      const matchesUser = userId
        ? String(item.payload?.userId) === String(userId)
        : true;
      return !(matchesDoc && matchesUser);
    });
    saveStore(store);
    return { deleted: true };
  }
};

const NON_NAME_WORDS = new Set([
  'resume', 'curriculum', 'vitae', 'cv', 'profile', 'summary', 'objective',
  'education', 'experience', 'skills', 'projects', 'certifications', 'achievements',
  'contact', 'address', 'phone', 'email', 'mobile', 'linkedin', 'github', 'portfolio',
  'work', 'history', 'employment', 'professional', 'technical', 'academic', 'personal',
  'details', 'information', 'page', 'document', 'course', 'overview', 'syllabus',
  'policy', 'handbook', 'manual', 'guide', 'report', 'chapter', 'section', 'part',
  'table', 'tables', 'contents', 'introduction', 'conclusion', 'appendix', 'references',
  'software', 'engineer', 'developer', 'frontend', 'backend', 'fullstack', 'full',
  'stack', 'data', 'scientist', 'analyst', 'manager', 'intern', 'student', 'graduate',
  'bachelor', 'master', 'university', 'college', 'institute', 'school', 'department',
  'computer', 'science', 'engineering', 'technology', 'system', 'systems', 'application',
  'sql', 'real', 'interview', 'interviews', 'question', 'questions', 'answer', 'answers',
  'database', 'databases', 'dbms', 'rdbms', 'query', 'queries', 'join', 'joins',
  'index', 'indexes', 'normalization', 'subquery', 'subqueries', 'transaction',
  'transactions', 'view', 'views', 'trigger', 'triggers', 'procedure', 'procedures',
  'function', 'functions', 'key', 'keys', 'primary', 'foreign', 'constraint',
  'constraints', 'schema', 'clause', 'select', 'where', 'group', 'order', 'having',
  'insert', 'update', 'delete', 'notes', 'tutorial', 'preparation', 'prep', 'exam',
  'test', 'quiz', 'study', 'material', 'materials', 'cheat', 'sheet', 'top', 'common',
  'frequently', 'asked', 'concepts', 'fundamentals', 'basics', 'advanced', 'practical',
  'examples', 'example', 'module', 'unit', 'lecture', 'assignment', 'lab', 'exercise',
  'from', 'with', 'into', 'over', 'under', 'between', 'without', 'using', 'union',
  'all', 'distinct', 'null', 'case', 'when', 'then', 'else', 'end', 'left', 'right',
  'inner', 'outer', 'self', 'asc', 'desc', 'limit', 'offset', 'exists', 'not', 'and',
  'or', 'as', 'on', 'in', 'is', 'by', 'for', 'to', 'of', 'at', 'the', 'employee',
  'employees', 'customer', 'customers', 'departments', 'salary', 'salaries', 'sales',
  'orders', 'product', 'products', 'company', 'companies', 'tredence', 'deloitte',
  'accenture', 'persistent', 'pwc', 'kpmg', 'ey', 'medium', 'more', 'find', 'write',
  'retrieve', 'count', 'calculate', 'list', 'get', 'identify', 'show', 'compare'
]);

export const stemToken = (word) => {
  const lower = String(word || '').toLowerCase().trim();
  if (lower.length <= 3) {
    return lower;
  }
  if (lower.endsWith('ies') && lower.length > 4) {
    return `${lower.slice(0, -3)}y`;
  }
  if (
    lower.endsWith('es') &&
    (lower.endsWith('xes') ||
      lower.endsWith('ches') ||
      lower.endsWith('shes') ||
      lower.endsWith('sses'))
  ) {
    return lower.slice(0, -2);
  }
  if (
    lower.endsWith('s') &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    !lower.endsWith('is')
  ) {
    return lower.slice(0, -1);
  }
  return lower;
};

const fixBrokenLigatures = (str) =>
  String(str || '').replace(
    /\b([A-Za-z]{2,}(?:ti|fi))\s+(ons?|on|fy|fied|fic|al)\b/gi,
    '$1$2'
  );

export const extractCandidateIdentityFromText = (text) => {
  const raw = fixBrokenLigatures(String(text || '').trim());
  if (!raw) {
    return { candidateName: null, email: null, phone: null };
  }

  const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = raw.match(
    /(?:\+\d{1,3}[\s.-]?)?\(?\d{3,5}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/
  );

  const labeledNameMatch = raw.match(
    /(?:^|\n)\s*(?:full\s+name|candidate\s+name|applicant\s+name|name)\s*[:\-]\s*([A-Za-z][A-Za-z.'\-\s]{1,48})/i
  );
  if (labeledNameMatch) {
    const cleanedLabeled = labeledNameMatch[1].split(/\n|\||,/)[0].trim();
    const labeledWords = cleanedLabeled.split(/\s+/).filter(Boolean);
    const hasInvalidLabeledWord = labeledWords.some((w) => {
      const cleanWord = w.toLowerCase().replace(/[^a-z]/g, '');
      return NON_NAME_WORDS.has(cleanWord) || NON_NAME_WORDS.has(stemToken(cleanWord));
    });
    if (cleanedLabeled.length >= 2 && !hasInvalidLabeledWord) {
      return {
        candidateName: cleanedLabeled,
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[0].trim() : null
      };
    }
  }

  const hasStrongPersonalSignal =
    Boolean(emailMatch) ||
    Boolean(phoneMatch) ||
    /\b(curriculum\s+vitae|linkedin\.com|github\.com|cgpa|b\.e\.|b\.tech|m\.tech|b\.sc|m\.sc|mca|bachelor\s+of|master\s+of)\b/i.test(
      raw
    );

  if (!hasStrongPersonalSignal) {
    return {
      candidateName: null,
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0].trim() : null
    };
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 8);

  for (const line of lines) {
    if (/^(education|experience|skills|projects|summary|objective|certifications)\b/i.test(line)) {
      break;
    }

    const firstSegment = line
      .split(/\||•|·|\s+-\s+|,/)[0]
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();

    if (!firstSegment || firstSegment.length < 3 || firstSegment.length > 45) {
      continue;
    }

    if (/\d/.test(firstSegment) || /[:/@?!=;()*]/.test(firstSegment)) {
      continue;
    }

    const words = firstSegment.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) {
      continue;
    }

    const allCapitalizedAlphabetic = words.every((w) =>
      /^[A-Z][A-Za-z.'-]*$/.test(w)
    );
    if (!allCapitalizedAlphabetic) {
      continue;
    }

    const hasNonNameWord = words.some((w) => {
      const cleanWord = w.toLowerCase().replace(/[^a-z]/g, '');
      return NON_NAME_WORDS.has(cleanWord) || NON_NAME_WORDS.has(stemToken(cleanWord));
    });
    if (hasNonNameWord) {
      continue;
    }

    return {
      candidateName: firstSegment,
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0].trim() : null
    };
  }

  return {
    candidateName: null,
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0].trim() : null
  };
};

const GENERIC_QUERY_META_WORDS = new Set([
  'name', 'full', 'first', 'last', 'person', 'people', 'candidate', 'applicant',
  'author', 'owner', 'who', 'whom', 'whose', 'resume', 'cv', 'curriculum', 'vitae',
  'profile', 'document', 'documents', 'doc', 'file', 'files', 'given', 'uploaded',
  'selected', 'current', 'pdf', 'docx', 'txt', 'page', 'in', 'of', 'the', 'is', 'are',
  'was', 'were', 'what', 'which', 'tell', 'me', 'us', 'my', 'your', 'our', 'about',
  'identify', 'belong', 'belongs', 'mentioned', 'mention', 'listed', 'list', 'present',
  'provided', 'provide', 'does', 'have', 'has', 'their', 'his', 'her', 'its', 'explain',
  'describe', 'summarize', 'summary', 'overview', 'elaborate', 'show', 'give', 'written',
  'stated', 'found', 'appear', 'appears', 'detail', 'details', 'information', 'info',
  'based', 'according', 'using', 'from', 'within', 'inside', 'covered', 'cover', 'covers',
  'contain', 'contains', 'included', 'include', 'includes', 'discussed', 'discuss',
  'main', 'key', 'major', 'core', 'important', 'topic', 'topics', 'section', 'sections',
  'chapter', 'chapters', 'content', 'contents', 'subject', 'subjects', 'learn', 'study',
  'purpose'
]);

const SECTION_SYNONYMS = {
  skills: [
    'skill', 'skills', 'technical', 'technologies', 'technology', 'stack',
    'tools', 'languages', 'frameworks', 'javascript', 'typescript', 'python',
    'java', 'react', 'node', 'express', 'mongodb', 'sql', 'docker', 'html', 'css', 'c++'
  ],
  education: [
    'education', 'educational', 'degree', 'university', 'college', 'school',
    'institute', 'bachelor', 'master', 'b.e', 'b.tech', 'm.tech', 'bsc', 'msc',
    'gpa', 'cgpa', 'graduated', 'academic', 'qualification', 'qualifications'
  ],
  projects: [
    'project', 'projects', 'built', 'developed', 'created', 'designed',
    'implemented', 'engineered', 'application', 'system', 'assistant', 'platform'
  ],
  experience: [
    'experience', 'work', 'employment', 'internship', 'intern', 'internships',
    'company', 'role', 'position', 'career', 'professional', 'engineer', 'developer'
  ],
  certifications: [
    'certification', 'certifications', 'certified', 'certificate', 'certificates',
    'achievement', 'achievements', 'award', 'awards', 'course', 'courses'
  ],
  contact: [
    'contact', 'email', 'mail', 'phone', 'mobile', 'number', 'linkedin',
    'github', 'address', 'location', 'reach'
  ]
};

const SECTION_HEADING_PATTERNS = {
  skills: /^(?:technical\s+|core\s+|key\s+|professional\s+)?skills(?:\s*(?:&|and)\s*(?:abilities|technologies|tools|competencies))?\s*:?$/i,
  education: /^(?:academic\s+)?education(?:al\s+(?:qualifications?|background))?\s*:?$/i,
  projects: /^(?:personal\s+|academic\s+|key\s+|major\s+|selected\s+|technical\s+)?projects?\s*:?$/i,
  experience: /^(?:work\s+|professional\s+|internship\s+|employment\s+|relevant\s+)?(?:experience|internships?|employment\s+history)\s*:?$/i,
  certifications: /^(?:certifications?|achievements?|awards?|honors?|licenses?)\s*:?$/i,
  summary: /^(?:professional\s+|career\s+|executive\s+)?(?:summary|profile|objective|about\s+me)\s*:?$/i,
  contact: /^(?:contact|personal)\s*(?:info|information|details)?\s*:?$/i
};

const INLINE_SECTION_PATTERNS = {
  skills: /^(?:technical\s+|core\s+|key\s+)?skills\s*[:\-]\s*(.+)$/i,
  education: /^(?:academic\s+)?education\s*[:\-]\s*(.+)$/i,
  projects: /^(?:personal\s+|academic\s+|key\s+)?projects?\s*[:\-]\s*(.+)$/i,
  experience: /^(?:work\s+|professional\s+)?experience\s*[:\-]\s*(.+)$/i,
  certifications: /^(?:certifications?|achievements?)\s*[:\-]\s*(.+)$/i
};

const isAnySectionHeading = (line) => {
  const trimmed = String(line || '').trim();
  return Object.values(SECTION_HEADING_PATTERNS).some((regex) => regex.test(trimmed));
};

const extractSectionContentFromExcerpts = (parsedExcerpts, sectionKey) => {
  const headingRegex = SECTION_HEADING_PATTERNS[sectionKey];
  const inlineRegex = INLINE_SECTION_PATTERNS[sectionKey];
  if (!headingRegex && !inlineRegex) {
    return null;
  }

  const orderedExcerpts = [...parsedExcerpts].sort(
    (a, b) => Number(a.chunkNumber ?? 0) - Number(b.chunkNumber ?? 0)
  );

  const collectedLines = [];
  let collecting = false;
  let lastActiveChunkNum = -999;

  for (const excerpt of orderedExcerpts) {
    const currentChunkNum = Number(excerpt.chunkNumber ?? 0);
    if (collecting && currentChunkNum > lastActiveChunkNum + 1) {
      collecting = false;
    }

    const lines = excerpt.bodyText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx];

      if (headingRegex && headingRegex.test(line)) {
        collecting = true;
        lastActiveChunkNum = currentChunkNum;
        continue;
      }

      if (inlineRegex) {
        const inlineMatch = line.match(inlineRegex);
        if (inlineMatch && inlineMatch[1]) {
          collectedLines.push(inlineMatch[1].trim());
          collecting = true;
          lastActiveChunkNum = currentChunkNum;
          continue;
        }
      }

      if (collecting) {
        if (isAnySectionHeading(line)) {
          collecting = false;
          continue;
        }
        if (idx === 0 && /^[a-z]{2,8}\.\s*$/i.test(line)) {
          continue;
        }
        collectedLines.push(line);
        lastActiveChunkNum = currentChunkNum;
      }
    }
  }

  const uniqueLines = [];
  const seen = new Set();
  for (const item of collectedLines) {
    const norm = item.toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      uniqueLines.push(item);
    }
  }

  return uniqueLines.length > 0 ? uniqueLines.join('\n') : null;
};

const isSqlCodeOrNoiseLine = (line) => {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return true;
  }
  if (/^[-=_*#]{3,}/.test(trimmed) || /THE\s+END/i.test(trimmed)) {
    return true;
  }
  if (
    /^(?:SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+OUTER\s+JOIN|CROSS\s+JOIN|UNION|WITH\b|INSERT\b|UPDATE\b|DELETE\b|CREATE\b|ALTER\b|DROP\b|VALUES\b|SET\b|INTO\b|ON\b|AND\b|OR\b|CASE\b|WHEN\b|THEN\b|ELSE\b|END\b|OVER\s*\(|PARTITION\s+BY|ROWS\s+BETWEEN|ROW_NUMBER\s*\(|RANK\s*\(|DENSE_RANK\s*\(|PERCENT_RANK\s*\(|CUME_DIST\s*\(|LAG\s*\(|LEAD\s*\(|SUM\s*\(|COUNT\s*\(|AVG\s*\(|MIN\s*\(|MAX\s*\(|PERCENTILE_CONT|DATE_TRUNC|DATEDIFF|INTERVAL\b|EXCEPT\b|INTERSECT\b|QUALIFY\b)/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/[;(]$/.test(trimmed) || /^\)\s*(?:AS\b|,|;|$)/i.test(trimmed)) {
    return true;
  }
  if (/^(?:Asked\s+at\b|Tredence\b|Accenture\b|Note\s*:|\(Replace\b|--)/i.test(trimmed)) {
    return true;
  }
  return false;
};

const detectSqlDomainTopicsFromText = (combinedText) => {
  const text = fixBrokenLigatures(combinedText);
  if (!/\b(?:sql|select\s+.+\s+from|join|group\s+by|database|table)\b/i.test(text)) {
    return [];
  }

  const detected = [];
  const rules = [
    {
      label: 'SQL Joins (INNER JOIN, LEFT JOIN, FULL OUTER JOIN, and Self-Joins)',
      regex: /\b(?:inner\s+join|left\s+join|right\s+join|full\s+outer\s+join|self[- ]join|join\s+\w+\s+\w+\s+on)\b/i
    },
    {
      label: 'Aggregations, GROUP BY, and HAVING Clauses',
      regex: /\b(?:group\s+by|having\s+count|having\s+sum|having\s+avg|having\s+max|having\s+min)\b/i
    },
    {
      label: 'Window Functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, PERCENT_RANK, Moving Averages)',
      regex: /\b(?:over\s*\(\s*partition\s+by|row_number\s*\(|rank\s*\(|dense_rank\s*\(|percent_rank\s*\(|cume_dist\s*\(|lag\s*\(|moving\s+average|running\s+total)\b/i
    },
    {
      label: 'Common Table Expressions (CTEs) and Recursive Hierarchy Queries',
      regex: /\b(?:with\s+recursive|reporting_chain|ancestors|descendants|hierarchy)\b/i
    },
    {
      label: 'Subqueries, Correlated Queries, and EXISTS Filtering',
      regex: /\b(?:subquer|where\s+not\s+exists|where\s+\w+\s+(?:in|<|>)\s*\(\s*select)\b/i
    },
    {
      label: 'Database Normalization (1NF, 2NF, 3NF, BCNF)',
      regex: /\b(?:normalization|1nf|2nf|3nf|bcnf)\b/i
    },
    {
      label: 'Indexing and Query Optimization',
      regex: /\b(?:clustered\s+and\s+non-clustered|indexing|query\s+optimization)\b/i
    },
    {
      label: 'Transactions and ACID Properties',
      regex: /\b(?:transactions?\s+and\s+acid|acid\s+properties|atomicity)\b/i
    },
    {
      label: 'Primary and Foreign Keys',
      regex: /\b(?:primary\s+and\s+foreign\s+keys|primary\s+key|foreign\s+key)\b/i
    },
    {
      label: 'Date/Time Manipulation and Gaps & Islands Analysis',
      regex: /\b(?:date_trunc|datediff|consecutive\s+streak|gaps\s+in|gaps\s+and\s+islands|interval\s+')\b/i
    },
    {
      label: 'Conditional Aggregation, Pivoting, and String/JSON Aggregation',
      regex: /\b(?:pivot|unpivot|conditional\s+aggregation|string_agg|json_agg|count\s*\(\s*case\s+when|sum\s*\(\s*case\s+when)\b/i
    }
  ];

  for (const rule of rules) {
    if (rule.regex.test(text)) {
      detected.push(rule.label);
    }
  }

  return detected;
};

export const extractTopicsFromExcerpts = (parsedExcerpts) => {
  const topics = [];
  const seen = new Set();

  const addTopic = (rawTopic) => {
    const cleaned = fixBrokenLigatures(String(rawTopic || ''))
      .replace(/^[^\w0-9]+/, '')
      .replace(/^(?:q\d+|question\s+\d+|\d+|[•·\-*])\s*[.):\-]?\s*/i, '')
      .replace(/^(?:topic|section|chapter|module|unit)\s*\d*\s*[:\-]\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[.;,:]+$/, '')
      .trim();

    if (cleaned.length < 3 || cleaned.length > 95) {
      return;
    }

    if (isSqlCodeOrNoiseLine(cleaned)) {
      return;
    }

    const lower = cleaned.toLowerCase();
    if (
      seen.has(lower) ||
      /^(?:document|page\s+\d+|excerpt\s+\d+|table\s+of\s+contents|questions?)$/i.test(
        cleaned
      )
    ) {
      return;
    }

    seen.add(lower);
    topics.push(cleaned);
  };

  const fullExcerptText = parsedExcerpts.map((e) => e.bodyText).join('\n\n');

  for (const excerpt of parsedExcerpts) {
    const lines = fixBrokenLigatures(excerpt.bodyText)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isSqlCodeOrNoiseLine(line)) {
        continue;
      }

      const inlineTopicsMatch = line.match(
        /(?:topics?\s*(?:covered|included)?|sections?|modules?|chapters?|covers)\s*[:\-]\s*(.+)$/i
      );
      if (inlineTopicsMatch && inlineTopicsMatch[1]) {
        const parts = inlineTopicsMatch[1]
          .split(/,|;|\||•|\band\b/i)
          .map((p) => p.trim())
          .filter(Boolean);
        for (const part of parts) {
          addTopic(part);
        }
        continue;
      }

      if (/^(?:topic|section|chapter|module)\s*\d*\s*[:\-]/i.test(line) && line.length <= 90) {
        addTopic(line);
        continue;
      }

      if (/^\d+\.\s+[A-Z]/.test(line)) {
        let combinedQuestion = line;
        if (
          i + 1 < lines.length &&
          !/[.?:;]$/.test(line) &&
          !isSqlCodeOrNoiseLine(lines[i + 1]) &&
          !/^\d+\./.test(lines[i + 1])
        ) {
          combinedQuestion = `${line} ${lines[i + 1]}`;
        }
        const strippedNum = combinedQuestion.replace(/^\d+\.\s*/, '').trim();
        if (
          strippedNum.split(/\s+/).length <= 6 &&
          !/^(?:find|write|retrieve|count|get|calculate|identify|list|show|compare|use|generate|detect)\b/i.test(
            strippedNum
          )
        ) {
          addTopic(strippedNum);
        }
      }
    }
  }

  const sqlDomainTopics = detectSqlDomainTopicsFromText(fullExcerptText);
  for (const sqlTopic of sqlDomainTopics) {
    addTopic(sqlTopic);
  }

  if (topics.length < 4) {
    for (const excerpt of parsedExcerpts) {
      const lines = fixBrokenLigatures(excerpt.bodyText)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (isSqlCodeOrNoiseLine(line)) {
          continue;
        }
        if (/^\d+\.\s+[A-Z]/.test(line)) {
          let combinedQuestion = line;
          if (
            i + 1 < lines.length &&
            !/[.?:;]$/.test(line) &&
            !isSqlCodeOrNoiseLine(lines[i + 1]) &&
            !/^\d+\./.test(lines[i + 1])
          ) {
            combinedQuestion = `${line} ${lines[i + 1]}`;
          }
          addTopic(combinedQuestion);
        } else {
          const words = line.split(/\s+/);
          if (
            words.length >= 2 &&
            words.length <= 8 &&
            line.length >= 5 &&
            line.length <= 70 &&
            !/[.!]$/.test(line) &&
            /^[A-Z0-9]/.test(line)
          ) {
            addTopic(line);
          }
        }
      }
    }
  }

  return topics.slice(0, 10);
};

const buildDocumentOverviewFromExcerpts = (parsedExcerpts, meta = {}) => {
  const firstExcerpt = parsedExcerpts[0];
  const filename = meta.filename || firstExcerpt?.filename || 'the uploaded document';
  const candidate =
    parsedExcerpts.find((e) => e.identity?.candidateName)?.identity?.candidateName ||
    null;

  if (candidate) {
    const presentSections = [];
    for (const sec of ['education', 'skills', 'projects', 'experience', 'certifications']) {
      if (extractSectionContentFromExcerpts(parsedExcerpts, sec)) {
        presentSections.push(sec);
      }
    }
    const secText =
      presentSections.length > 0
        ? ` covering ${presentSections.join(', ')}`
        : '';
    return `This document (${filename}) is the professional resume of ${candidate}${secText}.`;
  }

  const topics = extractTopicsFromExcerpts(parsedExcerpts);
  const firstBody = fixBrokenLigatures(firstExcerpt?.bodyText || '');
  const firstLines = firstBody
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const headerLines = [];
  for (const line of firstLines.slice(0, 6)) {
    if (/^\d+\.\s+/.test(line) || isSqlCodeOrNoiseLine(line)) {
      if (!/^(?:Asked\s+at|Tredence|Accenture)/i.test(line)) {
        break;
      }
    }
    if (/^Topics\s+Covered\s*:/i.test(line)) {
      break;
    }
    headerLines.push(line);
  }

  const joinedHeader = headerLines
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[.]+\s*$/, '')
    .trim();

  const filteredTopics = topics.filter(
    (t) =>
      !joinedHeader.toLowerCase().includes(t.toLowerCase()) &&
      t.toLowerCase() !== joinedHeader.toLowerCase()
  );

  if (joinedHeader && filteredTopics.length > 0) {
    const topicSummary = filteredTopics.slice(0, 6).join(', ');
    return `This uploaded document (${filename}) contains ${joinedHeader} for technical interview preparation and reference. Key topics and sections covered include ${topicSummary}.`;
  }

  if (filteredTopics.length > 0) {
    return `This uploaded document (${filename}) covers key topics and sections including ${filteredTopics.slice(0, 6).join(', ')}.`;
  }

  const meaningfulLines = firstLines.filter((l) => !isSqlCodeOrNoiseLine(l));
  if (meaningfulLines.length > 0) {
    const summarySentences = meaningfulLines.slice(0, 2).join(' ');
    return `This uploaded document (${filename}) contains the following material: ${summarySentences}`;
  }

  return NOT_FOUND_MESSAGE;
};

export const analyzeQuestionIntent = (question) => {
  const rawQuestion = String(question || '').trim();
  const lowerQuestion = rawQuestion.toLowerCase();
  const allTokens = tokenizeText(rawQuestion);

  const nonIdentityTokens = allTokens.filter(
    (t) => !GENERIC_QUERY_META_WORDS.has(t)
  );

  const hasIdentityTrigger =
    /\b(name|who\s+is|whose|person|candidate|applicant|author|owner)\b/i.test(
      lowerQuestion
    );

  const asksEmail =
    /\b(e-?mail|mail\s+id|email\s+address|email\s+id)\b/i.test(lowerQuestion);
  const asksPhone =
    /\b(phone|mobile|cell|telephone|contact\s+number)\b/i.test(lowerQuestion);

  const isPureIdentityQuery =
    hasIdentityTrigger && nonIdentityTokens.length === 0 && !asksEmail && !asksPhone;

  const isTopicListPattern =
    /\b(?:list|tell\s+me|what\s+are|show\s+me|give\s+me)\s+(?:all\s+)?(?:the\s+)?(?:main\s+|key\s+|major\s+|core\s+|important\s+)?(?:[a-z0-9]+\s+)?(?:topics?|sections?|chapters?|subjects?|concepts?|themes?)\b/i.test(
      lowerQuestion
    ) ||
    /\b(?:topics?|sections?|chapters?)\s+(?:covered|included|discussed|in\s+this|of\s+this)\b/i.test(
      lowerQuestion
    );

  const isDocumentOverviewPattern =
    /\b(summarize|summary|overview|synopsis|tl;?dr)\b/i.test(lowerQuestion) ||
    /\bwhat\s+(?:is|are)\s+(?:in\s+|inside\s+)?(?:this|the)\s+(?:uploaded\s+|given\s+|selected\s+|current\s+)?(?:pdf|document|doc|file|text|paper|handout|notes?)(?:\s+about|\s+for|\s+on)?\s*\??$/i.test(
      lowerQuestion
    ) ||
    /\bwhat\s+is\s+the\s+(?:main\s+|primary\s+)?(?:purpose|subject|theme|topic|focus)\s+of\s+(?:this|the)\s+(?:uploaded\s+|given\s+|selected\s+)?(?:pdf|document|doc|file)\b/i.test(
      lowerQuestion
    ) ||
    /\bwhat\s+(?:is|does)\s+(?:this|the)\s+(?:uploaded\s+|given\s+|selected\s+)?(?:pdf|document|doc|file)\s+(?:about|contain|cover|discuss|explain|talk\s+about|focus\s+on|teach|include)\b/i.test(
      lowerQuestion
    ) ||
    /\b(?:tell|give|describe|explain)\s+(?:to\s+)?(?:me\s+)?(?:what\s+)?(?:about\s+|an\s+overview\s+of\s+|a\s+summary\s+of\s+)?(?:this|the)\s+(?:uploaded\s+|given\s+|selected\s+)?(?:pdf|document|doc|file)\b/i.test(
      lowerQuestion
    ) ||
    /\bwhat\s+can\s+(?:i|we|you|one)\s+(?:learn|study|gain|get|understand)\s+(?:from|in|out\s+of)\s+(?:this|the)\s+(?:uploaded\s+)?(?:pdf|document|doc|file)\b/i.test(
      lowerQuestion
    ) ||
    /\bwhat\s+(?:topics?|sections?|chapters?|subjects?|concepts?)\s+does\s+(?:this|the)\s+(?:uploaded\s+)?(?:pdf|document|doc|file)\s+(?:cover|contain|include|discuss)\b/i.test(
      lowerQuestion
    );

  const isExplanationRequest =
    !isDocumentOverviewPattern &&
    !isTopicListPattern &&
    /\b(explain|describe|elaborate|how\s+does|how\s+do|difference\s+between|walk\s+through)\b/i.test(
      lowerQuestion
    );

  const matchedSections = [];
  for (const [sectionKey, terms] of Object.entries(SECTION_SYNONYMS)) {
    if (
      nonIdentityTokens.some(
        (token) =>
          sectionKey.includes(token) ||
          token.includes(sectionKey) ||
          terms.slice(0, 5).includes(token)
      )
    ) {
      matchedSections.push(sectionKey);
    }
  }

  let queryType = 'general';
  let intentCategory = 'specific_fact';

  if (isPureIdentityQuery) {
    queryType = 'name';
    intentCategory = 'list_extraction';
  } else if (asksEmail && !asksPhone && matchedSections.length <= 1) {
    queryType = 'email';
    intentCategory = 'list_extraction';
  } else if (asksPhone && !asksEmail && matchedSections.length <= 1) {
    queryType = 'phone';
    intentCategory = 'list_extraction';
  } else if (
    isTopicListPattern &&
    !/\b(?:what\s+topics?\s+does\s+(?:this|the)\s+(?:pdf|document|file)\s+cover)\b/i.test(
      lowerQuestion
    )
  ) {
    queryType = 'topic_list';
    intentCategory = 'list_extraction';
  } else if (isDocumentOverviewPattern) {
    queryType = 'overview';
    intentCategory = 'overview';
  } else if (matchedSections.includes('skills') && !isExplanationRequest) {
    queryType = 'skills';
    intentCategory = 'list_extraction';
  } else if (matchedSections.includes('education')) {
    queryType = 'education';
    intentCategory = 'list_extraction';
  } else if (matchedSections.includes('projects')) {
    queryType = 'projects';
    intentCategory = isExplanationRequest ? 'explanation' : 'list_extraction';
  } else if (matchedSections.includes('experience')) {
    queryType = 'experience';
    intentCategory = isExplanationRequest ? 'explanation' : 'list_extraction';
  } else if (matchedSections.includes('certifications')) {
    queryType = 'certifications';
    intentCategory = 'list_extraction';
  } else if (isExplanationRequest) {
    queryType = 'explanation';
    intentCategory = 'explanation';
  }

  const isOverviewQuery = queryType === 'overview' || queryType === 'topic_list';

  const expandedSearchTerms = new Set();
  for (const token of nonIdentityTokens) {
    expandedSearchTerms.add(token);
    expandedSearchTerms.add(stemToken(token));
  }
  for (const section of matchedSections) {
    for (const term of SECTION_SYNONYMS[section]) {
      expandedSearchTerms.add(term);
    }
  }

  return {
    intentCategory,
    queryType,
    isOverviewQuery,
    isPureIdentityQuery,
    isExplanationRequest,
    hasIdentityTrigger,
    matchedSections,
    specificKeywords: nonIdentityTokens,
    expandedSearchTerms: Array.from(expandedSearchTerms)
  };
};

const segmentExcerptIntoUnits = (bodyText) => {
  const cleaned = fixBrokenLigatures(bodyText);
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const units = [];
  let currentBlock = [];

  for (const line of lines) {
    if (/^\d+\.\s+[A-Z]/.test(line)) {
      if (currentBlock.length > 0) {
        units.push(currentBlock.join('\n'));
      }
      currentBlock = [line];
    } else if (currentBlock.length > 0) {
      currentBlock.push(line);
    } else {
      units.push(line);
    }
  }

  if (currentBlock.length > 0) {
    units.push(currentBlock.join('\n'));
  }

  const rawLineUnits = cleaned
    .split(/\n+|(?<=[.!?])\s+/)
    .map((u) => u.trim())
    .filter((u) => u.length >= 3);

  return {
    blockUnits: units,
    lineUnits: rawLineUnits
  };
};

const buildSqlConceptExplanation = (parsedExcerpts, intent) => {
  const asksJoins = intent.specificKeywords.some(
    (kw) => kw === 'join' || kw === 'joins'
  );
  if (!asksJoins) {
    return null;
  }

  const combinedText = parsedExcerpts.map((e) => e.bodyText).join('\n\n');
  if (!/\bjoin\b/i.test(combinedText)) {
    return null;
  }

  for (const excerpt of parsedExcerpts) {
    const lines = excerpt.bodyText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      if (
        /^(?:\d+\.\s*)?sql\s+joins?\b/i.test(lines[i]) &&
        i + 1 < lines.length &&
        !isSqlCodeOrNoiseLine(lines[i + 1])
      ) {
        return lines.slice(i, i + 3).join('\n');
      }
    }
  }

  const joinTypesFound = [];
  if (/\binner\s+join\b|\bjoin\s+\w+\s+\w+\s+on\b/i.test(combinedText)) {
    joinTypesFound.push(
      'INNER JOIN / Self-Join (matching related rows across tables or within the same table, such as comparing employee and manager salaries, hierarchy traversal, or finding employee pairs in the same department)'
    );
  }
  if (/\bleft\s+join\b/i.test(combinedText)) {
    joinTypesFound.push(
      'LEFT JOIN (retaining all records from the left table and filtering with WHERE ... IS NULL to find unmatched rows, such as departments with no employees or customers with no purchases)'
    );
  }
  if (/\bfull\s+outer\s+join\b/i.test(combinedText)) {
    joinTypesFound.push(
      'FULL OUTER JOIN (comparing two tables to identify rows with differences across columns)'
    );
  }
  if (/\bright\s+join\b/i.test(combinedText)) {
    joinTypesFound.push('RIGHT JOIN (matching all rows from the right table)');
  }

  if (joinTypesFound.length > 0) {
    return `Based on the SQL queries in this document, SQL JOIN clauses combine rows from two or more tables (or alias the same table) using related keys:\n- ${joinTypesFound.join('\n- ')}`;
  }

  return null;
};

export const synthesizeLocalExtractiveAnswer = (userPrompt) => {
  const raw = String(userPrompt || '');
  const contextMatch = raw.split('USER QUESTION:');
  const beforeQuestion = contextMatch[0] || '';
  const excerptSplit = beforeQuestion.split(/DOCUMENT CONTEXT(?:\s*\([^)]*\))?:\s*/i);
  const contextPart = (
    excerptSplit.length > 1 ? excerptSplit[1] : beforeQuestion
  ).trim();

  const metaFilenameMatch = beforeQuestion.match(/Filename:\s*([^\n]+)/i);
  const metaFileTypeMatch = beforeQuestion.match(/File Type:\s*([^\n]+)/i);
  const meta = {
    filename: metaFilenameMatch ? metaFilenameMatch[1].trim() : null,
    fileType: metaFileTypeMatch ? metaFileTypeMatch[1].trim() : null
  };

  const questionBlock = (contextMatch[1] || '').split('INSTRUCTIONS:')[0] || '';
  const question = questionBlock.trim();

  if (!contextPart) {
    return NOT_FOUND_MESSAGE;
  }

  const intent = analyzeQuestionIntent(question);
  const excerpts = contextPart
    .split('\n\n---\n\n')
    .map((block) => block.trim())
    .filter(Boolean);

  if (excerpts.length === 0) {
    return NOT_FOUND_MESSAGE;
  }

  const parsedExcerpts = excerpts.map((excerpt, idx) => {
    const lines = excerpt.split('\n');
    const headerLine = lines[0] || '';
    const bodyLines = lines.slice(1);
    const bodyText = bodyLines.join('\n').trim();

    const docMatch = headerLine.match(/Document:\s*([^|\]]+)/i);
    const pageMatch = headerLine.match(/Page\s+(\d+)/i);
    const chunkMatch = headerLine.match(/Chunk\s+#(\d+)/i);
    const headerCandidateMatch = headerLine.match(/Candidate\/Person Name:\s*([^|\]]+)/i);

    const filename = docMatch
      ? docMatch[1].trim()
      : meta.filename || 'the uploaded document';
    const pageLabel = pageMatch ? `Page ${pageMatch[1]}` : 'Page not available';
    const chunkNumber = chunkMatch ? Number(chunkMatch[1]) : idx;
    const chunkLabel = `Chunk #${chunkNumber}`;
    const parsedIdentity = extractCandidateIdentityFromText(bodyText);

    if (!parsedIdentity.candidateName && headerCandidateMatch) {
      const candidateFromHeader = headerCandidateMatch[1].trim();
      const words = candidateFromHeader.split(/\s+/);
      const hasInvalid = words.some((w) => {
        const cleanWord = w.toLowerCase().replace(/[^a-z]/g, '');
        return NON_NAME_WORDS.has(cleanWord) || NON_NAME_WORDS.has(stemToken(cleanWord));
      });
      if (!hasInvalid && words.length >= 2) {
        parsedIdentity.candidateName = candidateFromHeader;
      }
    }

    return {
      headerLine,
      bodyLines,
      bodyText,
      filename,
      pageLabel,
      chunkNumber,
      chunkLabel,
      identity: parsedIdentity
    };
  });

  if (intent.queryType === 'name' || intent.isPureIdentityQuery) {
    const detectedCandidate =
      parsedExcerpts.find((e) => e.identity.candidateName)?.identity.candidateName ||
      null;
    return detectedCandidate ? detectedCandidate : NOT_FOUND_MESSAGE;
  }

  if (intent.queryType === 'email') {
    const detectedEmail =
      parsedExcerpts.find((e) => e.identity.email)?.identity.email || null;
    return detectedEmail ? detectedEmail : NOT_FOUND_MESSAGE;
  }

  if (intent.queryType === 'phone') {
    const detectedPhone =
      parsedExcerpts.find((e) => e.identity.phone)?.identity.phone || null;
    return detectedPhone ? detectedPhone : NOT_FOUND_MESSAGE;
  }

  if (intent.queryType === 'topic_list') {
    const topics = extractTopicsFromExcerpts(parsedExcerpts);
    if (topics.length > 0) {
      return topics.map((t) => `- ${t}`).join('\n');
    }
    return buildDocumentOverviewFromExcerpts(parsedExcerpts, meta);
  }

  if (intent.queryType === 'overview') {
    return buildDocumentOverviewFromExcerpts(parsedExcerpts, meta);
  }

  if (
    intent.queryType === 'skills' ||
    intent.queryType === 'education' ||
    intent.queryType === 'projects' ||
    intent.queryType === 'experience' ||
    intent.queryType === 'certifications'
  ) {
    const sectionContent = extractSectionContentFromExcerpts(
      parsedExcerpts,
      intent.queryType
    );
    if (sectionContent) {
      return sectionContent;
    }
  }

  if (intent.isExplanationRequest) {
    const sqlConceptExplanation = buildSqlConceptExplanation(parsedExcerpts, intent);
    if (sqlConceptExplanation) {
      return sqlConceptExplanation;
    }
  }

  const scoredUnits = [];
  const stemmedKeywords = intent.specificKeywords.map(stemToken);

  for (const excerpt of parsedExcerpts) {
    const { blockUnits, lineUnits } = segmentExcerptIntoUnits(excerpt.bodyText);
    const candidateUnits =
      blockUnits.length > 0 && blockUnits.some((b) => /^\d+\.\s+/.test(b))
        ? blockUnits
        : lineUnits;

    for (let i = 0; i < candidateUnits.length; i += 1) {
      const unitText = candidateUnits[i];
      const unitLower = unitText.toLowerCase();
      const rawUnitTokens = tokenizeText(unitText);
      const unitTokens = new Set(rawUnitTokens);
      const stemmedUnitTokens = new Set(rawUnitTokens.map(stemToken));

      let directOverlap = 0;
      for (let k = 0; k < intent.specificKeywords.length; k += 1) {
        const kw = intent.specificKeywords[k];
        const kwStem = stemmedKeywords[k];
        if (
          unitTokens.has(kw) ||
          stemmedUnitTokens.has(kwStem) ||
          unitLower.includes(kw) ||
          (kwStem.length >= 3 && unitLower.includes(kwStem))
        ) {
          directOverlap += 2;
        }
      }

      let expandedOverlap = 0;
      for (const term of intent.expandedSearchTerms) {
        const termStem = stemToken(term);
        if (
          unitTokens.has(term) ||
          stemmedUnitTokens.has(termStem) ||
          unitLower.includes(term)
        ) {
          expandedOverlap += 1;
        }
      }

      const isSectionHeading =
        intent.matchedSections.some((sec) =>
          new RegExp(`^\\s*${sec}`, 'i').test(unitText)
        ) ||
        stemmedKeywords.some(
          (kwStem) =>
            kwStem.length >= 3 && new RegExp(`^(?:\\d+\\.\\s*)?${kwStem}`, 'i').test(unitText)
        );

      const combinedUnit =
        isSectionHeading &&
        candidateUnits === lineUnits &&
        i + 1 < candidateUnits.length
          ? candidateUnits.slice(i, i + 4).join('\n')
          : unitText;

      const totalScore =
        directOverlap + expandedOverlap * 0.6 + (isSectionHeading ? 3 : 0);

      if (totalScore > 0) {
        scoredUnits.push({
          text: combinedUnit,
          score: totalScore
        });
      }
    }
  }

  scoredUnits.sort((a, b) => b.score - a.score);

  if (scoredUnits.length === 0) {
    return NOT_FOUND_MESSAGE;
  }

  const maxUnits =
    intent.isExplanationRequest || intent.matchedSections.length > 0 ? 3 : 1;

  const selectedUnits = [];
  const seenTexts = new Set();
  for (const item of scoredUnits) {
    const normalized = item.text.toLowerCase();
    if (!seenTexts.has(normalized)) {
      seenTexts.add(normalized);
      selectedUnits.push(item.text);
    }
    if (selectedUnits.length >= maxUnits) {
      break;
    }
  }

  return selectedUnits.join('\n');
};
