import { getDbStatus } from '../config/db.js';
import { checkQdrantHealth } from '../services/qdrantService.js';
import { checkOllamaHealth } from '../services/ollamaService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getSystemHealth = asyncHandler(async (req, res) => {
  const [qdrant, ollama] = await Promise.all([
    checkQdrantHealth(),
    checkOllamaHealth()
  ]);

  const mongodb = getDbStatus();

  res.status(200).json({
    success: true,
    services: {
      mongodb,
      qdrant,
      ollama
    }
  });
});
