import path from 'node:path';
import { promises as fs } from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './env.js';
import { errorHandler } from './middleware/error.js';
import { csrf } from './middleware/csrf.js';
import { authRouter } from './routes/auth.js';
import { groupsRouter } from './routes/groups.js';
import { membersRouter } from './routes/members.js';
import { activitiesRouter } from './routes/activities.js';
import { invoicesRouter } from './routes/invoices.js';

async function main(): Promise<void> {
  await fs.mkdir(path.join(env.dataDir, 'auth'), { recursive: true });
  await fs.mkdir(path.join(env.dataDir, 'users'), { recursive: true });
  await fs.mkdir(path.join(env.dataDir, 'groups'), { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ level: env.isProd ? 'info' : 'warn' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(csrf(['/api/auth/login', '/api/auth/signup']));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/groups/:gid/members', membersRouter);
  app.use('/api/groups/:gid/activities', activitiesRouter);
  app.use('/api/groups/:gid/activities/:aid/invoices', invoicesRouter);

  if (env.isProd) {
    app.use(express.static(env.clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(env.clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  // Bind explicitly to 0.0.0.0 so Fly's health checks on the public IPv4
  // address can reach us (Node otherwise binds to :: which is fine on most
  // dual-stack hosts but has occasionally surprised Fly's prober).
  app.listen(env.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`BuddySplit server listening on 0.0.0.0:${env.port} (env=${env.nodeEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('failed to start server', err);
  process.exit(1);
});
