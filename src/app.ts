// Load .env before anything else
import { config } from './config';
config.load();

import express from 'express';
import http from 'node:http';
import path from 'path';
import { apiReference } from '@scalar/express-api-reference';
import { swaggerSpec } from './docs/openapi';
import categoryRoutes from './routes/categories';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roomRoutes from './routes/rooms';
import commentRoutes from './routes/comments';
import seatRoutes from './routes/seats';
import zegoRoutes from './routes/zego';
import { roomWsManager } from './ws/roomWsManager';

const app = express();

app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../public')));

// ─── API Docs (Scalar) ────────────────────────────────────────────────────────
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
app.use('/api-docs', apiReference({ spec: { content: swaggerSpec } }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', db: process.env.DB_DRIVER ?? 'sqlite', timestamp: new Date().toISOString() });
});

app.get('/ws-docs', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/ws-docs.html'));
});

app.get('/ws-docs.html', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/ws-docs.html'));
});

app.use('/categories', categoryRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/rooms', roomRoutes);
app.use('/rooms/:id/comments', commentRoutes);
app.use('/rooms/:id/seats', seatRoutes);
app.use('/zego', zegoRoutes);

app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;

if (require.main === module) {
  (async () => {
    const PORT = process.env.PORT ?? 3000;

    const { initDb } = await import('./db');
    await initDb();

    if (process.env.DB_DRIVER === 'mysql') {
      const { initMysql, initRedis } = await import('./db/init-mysql');
      await initMysql();
      await initRedis();
    } else {
      const { runSqliteMigrations } = await import('./db/migrate');
      runSqliteMigrations();
    }

    const server = http.createServer(app);
    roomWsManager.attach(server);
    server.listen(PORT, () => {
      console.log(`🎙️  Voice Room Server running on http://localhost:${PORT}`);
      console.log(`🗄️   Database:          ${(process.env.DB_DRIVER ?? 'sqlite').toUpperCase()}`);
      console.log(`📖  REST API Docs:     http://localhost:${PORT}/api-docs`);
      console.log(`🔌  WebSocket Docs:    http://localhost:${PORT}/ws-docs`);
    });
  })().catch(err => { console.error('Startup failed:', err); process.exit(1); });
}
