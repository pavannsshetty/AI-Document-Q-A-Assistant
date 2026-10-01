import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const checkOllamaHealth = async (options = {}) => {
  const ollamaUrl = (options.ollamaUrl || env.ollamaUrl).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  try {
    const response = await fetchImpl(`${ollamaUrl}/api/tags`, {
      method: 'GET'
    });
    if (!response.ok) {
      return {
        available: false,
        status: response.status,
        url: ollamaUrl,
        models: []
      };
    }
    const data = await response.json();
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m.name)
      : [];
    return {
      available: true,
      url: ollamaUrl,
      models,
      chatModelConfigured: env.ollamaChatModel,
      embedModelConfigured: env.ollamaEmbedModel
    };
  } catch (error) {
    return {
      available: false,
      url: ollamaUrl,
      error: error.message,
      models: []
    };
  }
};

export const generateChatResponse = async ({
  systemPrompt,
  userPrompt,
  options = {}
}) => {
  const ollamaUrl = (options.ollamaUrl || env.ollamaUrl).replace(/\/+$/, '');
  const model = options.model || env.ollamaChatModel;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  let response;
  try {
    response = await fetchImpl(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: {
          temperature: 0.1
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
  } catch (error) {
    throw new AppError(
      `Ollama connection refused at ${ollamaUrl}. Ensure Ollama is installed and running locally.`,
      503,
      'OLLAMA_CONNECTION_REFUSED'
    );
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const errorMessage = String(errorPayload.error || response.statusText);
    if (errorMessage.toLowerCase().includes('not found')) {
      throw new AppError(
        `Ollama chat model '${model}' not found. Run: ollama pull ${model}`,
        424,
        'OLLAMA_MODEL_NOT_FOUND'
      );
    }
    throw new AppError(
      `LLM response failed from Ollama: ${errorMessage}`,
      502,
      'LLM_RESPONSE_FAILED'
    );
  }

  const data = await response.json();
  const content = data?.message?.content || data?.response || '';
  const trimmed = String(content).trim();

  if (!trimmed) {
    throw new AppError(
      'Ollama returned an empty response for the question.',
      502,
      'LLM_EMPTY_RESPONSE'
    );
  }

  return trimmed;
};
