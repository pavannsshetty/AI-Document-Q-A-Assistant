import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { generateLocalFallbackEmbedding } from './localStoreService.js';

const validateVector = (vector, modelName) => {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new AppError(
      `Embedding generation failed: Ollama model '${modelName}' returned an empty vector.`,
      502,
      'EMBEDDING_EMPTY_VECTOR'
    );
  }
  const hasInvalidNumber = vector.some((val) => typeof val !== 'number' || Number.isNaN(val));
  if (hasInvalidNumber) {
    throw new AppError(
      `Embedding generation failed: Ollama model '${modelName}' returned non-numeric values.`,
      502,
      'EMBEDDING_INVALID_VECTOR'
    );
  }
  return vector;
};

export const generateEmbedding = async (text, options = {}) => {
  const cleanedText = String(text || '').trim();
  if (!cleanedText) {
    throw new AppError('Cannot generate embedding for empty text.', 400, 'EMPTY_EMBEDDING_INPUT');
  }

  const ollamaUrl = (options.ollamaUrl || env.ollamaUrl).replace(/\/+$/, '');
  const model = options.model || env.ollamaEmbedModel;
  const hasCustomFetch = typeof options.fetchImpl === 'function';
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  let response;
  try {
    response = await fetchImpl(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: cleanedText
      })
    });
  } catch (error) {
    if (!hasCustomFetch) {
      return generateLocalFallbackEmbedding(cleanedText);
    }
    throw new AppError(
      `Ollama connection refused at ${ollamaUrl}. Ensure Ollama is installed and running locally.`,
      503,
      'OLLAMA_CONNECTION_REFUSED'
    );
  }

  if (response.status === 404) {
    const errorPayload = await response.json().catch(() => ({}));
    const errorText = String(errorPayload.error || '');

    if (errorText.toLowerCase().includes('model') && errorText.toLowerCase().includes('not found')) {
      throw new AppError(
        `Ollama embedding model '${model}' not found. Run: ollama pull ${model}`,
        424,
        'OLLAMA_MODEL_NOT_FOUND'
      );
    }

    let legacyResponse;
    try {
      legacyResponse = await fetchImpl(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: cleanedText
        })
      });
    } catch (error) {
      if (!hasCustomFetch) {
        return generateLocalFallbackEmbedding(cleanedText);
      }
      throw new AppError(
        `Ollama connection refused at ${ollamaUrl}. Ensure Ollama is installed and running locally.`,
        503,
        'OLLAMA_CONNECTION_REFUSED'
      );
    }

    if (!legacyResponse.ok) {
      const legacyErr = await legacyResponse.json().catch(() => ({}));
      const legacyMsg = String(legacyErr.error || legacyResponse.statusText);
      if (legacyMsg.toLowerCase().includes('not found')) {
        throw new AppError(
          `Ollama embedding model '${model}' not found. Run: ollama pull ${model}`,
          424,
          'OLLAMA_MODEL_NOT_FOUND'
        );
      }
      throw new AppError(
        `Embedding generation failed: ${legacyMsg}`,
        502,
        'EMBEDDING_FAILURE'
      );
    }

    const legacyData = await legacyResponse.json();
    return validateVector(legacyData.embedding, model);
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const errorMessage = String(errorPayload.error || response.statusText);
    if (errorMessage.toLowerCase().includes('not found')) {
      throw new AppError(
        `Ollama embedding model '${model}' not found. Run: ollama pull ${model}`,
        424,
        'OLLAMA_MODEL_NOT_FOUND'
      );
    }
    throw new AppError(
      `Embedding generation failed: ${errorMessage}`,
      502,
      'EMBEDDING_FAILURE'
    );
  }

  const data = await response.json();
  const vector = Array.isArray(data.embeddings) ? data.embeddings[0] : data.embedding;
  return validateVector(vector, model);
};

export const generateEmbeddingsForChunks = async (chunks, options = {}) => {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  const vectors = [];
  const total = chunks.length;
  const onProgress =
    typeof options.onProgress === 'function' ? options.onProgress : null;

  for (let index = 0; index < total; index += 1) {
    const chunk = chunks[index];
    const vector = await generateEmbedding(chunk.text, options);
    vectors.push(vector);
    if (onProgress) {
      onProgress(index + 1, total);
    }
  }
  return vectors;
};
