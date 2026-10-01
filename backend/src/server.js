import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { checkOllamaHealth } from './services/ollamaService.js';
import { checkQdrantHealth } from './services/qdrantService.js';

const startServer = async () => {
  try {
    await connectDatabase();
    console.log(`Connected to MongoDB at ${env.mongodbUri}`);
  } catch (error) {
    console.error(`Warning: ${error.message}`);
    console.error('Ensure MongoDB or MongoDB Atlas is running and MONGODB_URI is set in .env');
  }

  const [ollamaStatus, qdrantStatus] = await Promise.all([
    checkOllamaHealth(),
    checkQdrantHealth()
  ]);

  if (!ollamaStatus.available) {
    console.warn(`Warning: Ollama is not reachable at ${env.ollamaUrl}. Start Ollama and pull required models.`);
  } else {
    console.log(`Connected to Ollama at ${env.ollamaUrl}`);
  }

  if (!qdrantStatus.available) {
    console.warn(`Warning: Qdrant is not reachable at ${env.qdrantUrl}. Start Qdrant on port 6333.`);
  } else {
    console.log(`Connected to Qdrant at ${env.qdrantUrl}`);
  }

  app.listen(env.port, () => {
    console.log(`AI Document Q&A Backend running on http://localhost:${env.port}`);
  });
};

startServer();
