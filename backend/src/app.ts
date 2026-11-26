import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ApiController } from './controllers/apiController.js';
import { createApiRouter } from './routes/apiRoutes.js';
import { ensureDemoSeedData } from './services/seedService.js';
import { IStorageRepository, JsonFileRepository } from './services/storageService.js';

export interface CreateAppOptions {
  repository?: IStorageRepository;
  seedDemo?: boolean;
  disableRateLimit?: boolean;
}

export function createApp(options?: CreateAppOptions) {
  const app = express();
  const repo = options?.repository ?? new JsonFileRepository();

  if (options?.seedDemo !== false) {
    ensureDemoSeedData(repo);
  }

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
  );

  app.use(express.json({ limit: '10mb' }));

  // Request logger
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  if (!options?.disableRateLimit && process.env.NODE_ENV !== 'test') {
    app.use(
      '/api',
      rateLimit({
        windowMs: 60 * 1000,
        limit: 180,
        standardHeaders: true,
        legacyHeaders: false,
      })
    );
  }

  const controller = new ApiController(repo);
  app.use('/api', createApiRouter(controller));

  // 404 handler for unknown API routes
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return app;
}
