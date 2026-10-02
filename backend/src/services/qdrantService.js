import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { generateDeterministicUuid } from '../utils/uuid.js';
import { ragLogger } from '../utils/logger.js';
import { localVectorStore } from './localStoreService.js';

const buildQdrantHeaders = (apiKey) => {
  const headers = { 'Content-Type': 'application/json' };
  const resolvedKey = apiKey !== undefined ? apiKey : env.qdrantApiKey;
  if (resolvedKey) {
    headers['api-key'] = resolvedKey;
  }
  return headers;
};

const extractCollectionDimension = (collectionInfo) => {
  const vectorsConfig = collectionInfo?.result?.config?.params?.vectors;
  if (!vectorsConfig) {
    return null;
  }
  if (typeof vectorsConfig.size === 'number') {
    return vectorsConfig.size;
  }
  const firstNamed = Object.values(vectorsConfig)[0];
  if (firstNamed && typeof firstNamed.size === 'number') {
    return firstNamed.size;
  }
  return null;
};

export const checkQdrantHealth = async (options = {}) => {
  const qdrantUrl = (options.qdrantUrl || env.qdrantUrl).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  try {
    const response = await fetchImpl(`${qdrantUrl}/collections`, {
      method: 'GET',
      headers: buildQdrantHeaders(options.apiKey)
    });
    return {
      available: response.ok,
      status: response.status,
      url: qdrantUrl
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      url: qdrantUrl
    };
  }
};

export const ensureCollectionExists = async (vectorDimension, options = {}) => {
  if (typeof vectorDimension !== 'number' || vectorDimension <= 0) {
    throw new AppError(
      'Invalid vector dimension detected from embedding model.',
      500,
      'INVALID_VECTOR_DIMENSION'
    );
  }

  const qdrantUrl = (options.qdrantUrl || env.qdrantUrl).replace(/\/+$/, '');
  const collectionName = options.collectionName || env.qdrantCollection;
  const hasCustomFetch = typeof options.fetchImpl === 'function';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const headers = buildQdrantHeaders(options.apiKey);

  let getResponse;
  try {
    getResponse = await fetchImpl(
      `${qdrantUrl}/collections/${encodeURIComponent(collectionName)}`,
      {
        method: 'GET',
        headers
      }
    );
  } catch (error) {
    if (!hasCustomFetch) {
      return { created: false, dimension: vectorDimension, localFallback: true };
    }
    throw new AppError(
      `Qdrant connection refused at ${qdrantUrl}. Ensure Qdrant is running locally via Docker on port 6333.`,
      503,
      'QDRANT_CONNECTION_REFUSED'
    );
  }

  if (getResponse.ok) {
    const info = await getResponse.json();
    const existingDimension = extractCollectionDimension(info);
    if (existingDimension && existingDimension !== vectorDimension) {
      throw new AppError(
        `Embedding dimension mismatch: Qdrant collection '${collectionName}' expects dimension ${existingDimension}, but Ollama embedding model produced dimension ${vectorDimension}. Delete the existing Qdrant collection or revert OLLAMA_EMBED_MODEL.`,
        409,
        'EMBEDDING_DIMENSION_MISMATCH'
      );
    }
    return { created: false, dimension: existingDimension || vectorDimension };
  }

  if (getResponse.status !== 404) {
    const errorBody = await getResponse.text().catch(() => '');
    throw new AppError(
      `Qdrant error while checking collection '${collectionName}': ${errorBody || getResponse.statusText}`,
      502,
      'QDRANT_ERROR'
    );
  }

  let createResponse;
  try {
    createResponse = await fetchImpl(
      `${qdrantUrl}/collections/${encodeURIComponent(collectionName)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          vectors: {
            size: vectorDimension,
            distance: 'Cosine'
          }
        })
      }
    );
  } catch (error) {
    if (!hasCustomFetch) {
      return { created: true, dimension: vectorDimension, localFallback: true };
    }
    throw new AppError(
      `Qdrant connection refused at ${qdrantUrl} while creating collection.`,
      503,
      'QDRANT_CONNECTION_REFUSED'
    );
  }

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => '');
    throw new AppError(
      `Failed to create Qdrant collection '${collectionName}': ${errorBody || createResponse.statusText}`,
      502,
      'QDRANT_COLLECTION_CREATE_FAILED'
    );
  }

  return { created: true, dimension: vectorDimension };
};

export const upsertDocumentChunks = async ({ chunks, vectors, options = {} }) => {
  if (!Array.isArray(chunks) || !Array.isArray(vectors) || chunks.length !== vectors.length) {
    throw new AppError(
      'Chunks and embedding vectors count must match for Qdrant storage.',
      400,
      'QDRANT_UPSERT_MISMATCH'
    );
  }

  if (chunks.length === 0) {
    return { storedCount: 0 };
  }

  const vectorDimension = Array.isArray(vectors[0]) ? vectors[0].length : 0;
  if (vectorDimension <= 0) {
    throw new AppError(
      'Invalid embedding vector dimension.',
      500,
      'INVALID_VECTOR_DIMENSION'
    );
  }

  for (let i = 0; i < vectors.length; i += 1) {
    if (!Array.isArray(vectors[i]) || vectors[i].length !== vectorDimension) {
      throw new AppError(
        `Inconsistent embedding dimensions detected at chunk #${i}: expected ${vectorDimension}, got ${
          Array.isArray(vectors[i]) ? vectors[i].length : 0
        }.`,
        500,
        'INCONSISTENT_VECTOR_DIMENSIONS'
      );
    }
  }

  const points = chunks.map((chunk, index) => ({
    id: generateDeterministicUuid(`${chunk.documentId}:${chunk.chunkIndex}`),
    vector: vectors[index],
    payload: {
      documentId: String(chunk.documentId),
      userId: String(chunk.userId),
      filename: String(chunk.filename),
      page: chunk.page !== undefined && chunk.page !== null ? Number(chunk.page) : null,
      chunkIndex: Number(chunk.chunkIndex),
      text: String(chunk.text)
    }
  }));

  const docId = String(chunks[0].documentId);
  const usrId = String(chunks[0].userId);
  const docFilename = String(chunks[0].filename);

  localVectorStore.deleteByDocument({ documentId: docId, userId: usrId });
  localVectorStore.upsertPoints(points);

  const collectionCheck = await ensureCollectionExists(vectorDimension, options);
  if (collectionCheck?.localFallback) {
    ragLogger.logIndexing({
      documentId: docId,
      filename: docFilename,
      indexedCount: points.length,
      vectorDimension,
      storageBackend: 'local_vector_store'
    });
    return { storedCount: points.length, dimension: vectorDimension };
  }

  const qdrantUrl = (options.qdrantUrl || env.qdrantUrl).replace(/\/+$/, '');
  const collectionName = options.collectionName || env.qdrantCollection;
  const hasCustomFetch = typeof options.fetchImpl === 'function';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const headers = buildQdrantHeaders(options.apiKey);

  if (options.replaceExisting) {
    await deleteDocumentVectors({
      documentId: docId,
      userId: usrId,
      options
    }).catch(() => {});
  }

  let response;
  try {
    response = await fetchImpl(
      `${qdrantUrl}/collections/${encodeURIComponent(collectionName)}/points?wait=true`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ points })
      }
    );
  } catch (error) {
    if (!hasCustomFetch) {
      ragLogger.logIndexing({
        documentId: docId,
        filename: docFilename,
        indexedCount: points.length,
        vectorDimension,
        storageBackend: 'local_vector_store'
      });
      return { storedCount: points.length, dimension: vectorDimension };
    }
    throw new AppError(
      `Qdrant connection refused at ${qdrantUrl} during vector storage.`,
      503,
      'QDRANT_CONNECTION_REFUSED'
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new AppError(
      `Failed to store vectors in Qdrant: ${errorBody || response.statusText}`,
      502,
      'QDRANT_UPSERT_FAILED'
    );
  }

  ragLogger.logIndexing({
    documentId: docId,
    filename: docFilename,
    indexedCount: points.length,
    vectorDimension,
    storageBackend: 'qdrant'
  });

  return { storedCount: points.length, dimension: vectorDimension };
};

export const searchVectors = async ({
  queryVector,
  documentId,
  userId,
  limit = 6,
  options = {}
}) => {
  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    throw new AppError('Query vector is required for similarity search.', 400, 'INVALID_QUERY_VECTOR');
  }

  const collectionCheck = await ensureCollectionExists(queryVector.length, options);
  if (collectionCheck?.localFallback) {
    return localVectorStore.searchPoints({
      queryVector,
      documentId,
      userId,
      limit
    });
  }

  const qdrantUrl = (options.qdrantUrl || env.qdrantUrl).replace(/\/+$/, '');
  const collectionName = options.collectionName || env.qdrantCollection;
  const hasCustomFetch = typeof options.fetchImpl === 'function';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const headers = buildQdrantHeaders(options.apiKey);

  const mustConditions = [
    {
      key: 'userId',
      match: { value: String(userId) }
    }
  ];

  if (documentId) {
    mustConditions.push({
      key: 'documentId',
      match: { value: String(documentId) }
    });
  }

  let response;
  try {
    response = await fetchImpl(
      `${qdrantUrl}/collections/${encodeURIComponent(collectionName)}/points/search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vector: queryVector,
          limit,
          with_payload: true,
          filter: {
            must: mustConditions
          }
        })
      }
    );
  } catch (error) {
    if (!hasCustomFetch) {
      return localVectorStore.searchPoints({
        queryVector,
        documentId,
        userId,
        limit
      });
    }
    throw new AppError(
      `Qdrant connection refused at ${qdrantUrl} during similarity search.`,
      503,
      'QDRANT_CONNECTION_REFUSED'
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new AppError(
      `Qdrant similarity search failed: ${errorBody || response.statusText}`,
      502,
      'QDRANT_SEARCH_FAILED'
    );
  }

  const data = await response.json();
  const hits = Array.isArray(data.result) ? data.result : [];

  return hits.map((hit) => ({
    id: hit.id,
    score: typeof hit.score === 'number' ? hit.score : 0,
    documentId: hit.payload?.documentId || String(documentId),
    userId: hit.payload?.userId || String(userId),
    filename: hit.payload?.filename || 'Document',
    page:
      hit.payload?.page !== undefined && hit.payload?.page !== null
        ? Number(hit.payload.page)
        : null,
    chunkIndex:
      typeof hit.payload?.chunkIndex === 'number' ? hit.payload.chunkIndex : 0,
    text: hit.payload?.text || ''
  }));
};

export const getDocumentChunksFromVectorStore = async ({
  documentId,
  userId,
  limit = 100,
  options = {}
}) => {
  if (!documentId || !userId) {
    return [];
  }

  const localChunks = localVectorStore.getByDocument({
    documentId,
    userId,
    limit
  });

  const qdrantUrl = (options.qdrantUrl || env.qdrantUrl).replace(/\/+$/, '');
  const collectionName = options.collectionName || env.qdrantCollection;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const headers = buildQdrantHeaders(options.apiKey);

  try {
    const response = await fetchImpl(
      `${qdrantUrl}/collections/${encodeURIComponent(collectionName)}/points/scroll`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit,
          with_payload: true,
          with_vector: false,
          filter: {
            must: [
              { key: 'userId', match: { value: String(userId) } },
              { key: 'documentId', match: { value: String(documentId) } }
            ]
          }
        })
      }
    );

    if (response && response.ok) {
      const data = await response.json();
      const points = Array.isArray(data?.result?.points) ? data.result.points : [];
      if (points.length > 0) {
        return points
          .map((pt) => ({
            id: pt.id,
            score: 0,
            documentId: pt.payload?.documentId || String(documentId),
            userId: pt.payload?.userId || String(userId),
            filename: pt.payload?.filename || 'Document',
            page:
              pt.payload?.page !== undefined && pt.payload?.page !== null
                ? Number(pt.payload.page)
                : null,
            chunkIndex:
              typeof pt.payload?.chunkIndex === 'number' ? pt.payload.chunkIndex : 0,
            text: pt.payload?.text || ''
          }))
          .sort((a, b) => a.chunkIndex - b.chunkIndex);
      }
    }
  } catch {
    return localChunks;
  }

  return localChunks;
};

export const deleteDocumentVectors = async ({ documentId, userId, options = {} }) => {
  localVectorStore.deleteByDocument({ documentId, userId });

  const qdrantUrl = (options.qdrantUrl || env.qdrantUrl).replace(/\/+$/, '');
  const collectionName = options.collectionName || env.qdrantCollection;
  const hasCustomFetch = typeof options.fetchImpl === 'function';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const headers = buildQdrantHeaders(options.apiKey);

  let getResponse;
  try {
    getResponse = await fetchImpl(
      `${qdrantUrl}/collections/${encodeURIComponent(collectionName)}`,
      {
        method: 'GET',
        headers
      }
    );
  } catch (error) {
    if (!hasCustomFetch) {
      return { deleted: true };
    }
    throw new AppError(
      `Qdrant connection refused at ${qdrantUrl} while deleting document vectors.`,
      503,
      'QDRANT_CONNECTION_REFUSED'
    );
  }

  if (getResponse.status === 404) {
    return { deleted: true };
  }

  const mustConditions = [
    {
      key: 'documentId',
      match: { value: String(documentId) }
    }
  ];

  if (userId) {
    mustConditions.push({
      key: 'userId',
      match: { value: String(userId) }
    });
  }

  let deleteResponse;
  try {
    deleteResponse = await fetchImpl(
      `${qdrantUrl}/collections/${encodeURIComponent(collectionName)}/points/delete?wait=true`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: {
            must: mustConditions
          }
        })
      }
    );
  } catch (error) {
    if (!hasCustomFetch) {
      return { deleted: true };
    }
    throw new AppError(
      `Qdrant connection refused at ${qdrantUrl} while deleting document vectors.`,
      503,
      'QDRANT_CONNECTION_REFUSED'
    );
  }

  if (!deleteResponse.ok) {
    const errorBody = await deleteResponse.text().catch(() => '');
    throw new AppError(
      `Failed to delete vectors from Qdrant: ${errorBody || deleteResponse.statusText}`,
      502,
      'QDRANT_DELETE_FAILED'
    );
  }

  return { deleted: true };
};
