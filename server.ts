import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './backend/src/app.js';
import { connectDatabase } from './backend/src/config/db.js';
import { errorHandler } from './backend/src/middleware/errorMiddleware.js';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);

const startUnifiedServer = async () => {
  try {
    await connectDatabase();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`MongoDB startup status: ${message}`);
  }

  const app = createApiApp({ skipNotFoundHandler: true });

  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      code: 'ROUTE_NOT_FOUND',
      message: `API route not found: ${req.method} ${req.originalUrl}`
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(currentDirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
  });
};

startUnifiedServer();
