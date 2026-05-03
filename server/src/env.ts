import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) {
  if (isProd) {
    throw new Error('JWT_SECRET must be set in production');
  }
  // Dev-only fallback: an ephemeral random secret per process. Sessions don't
  // survive a server restart, but no static signing key is ever shipped.
  jwtSecret = randomBytes(32).toString('hex');
  // eslint-disable-next-line no-console
  console.warn(
    '[env] JWT_SECRET not set — using an ephemeral dev secret (logins reset on restart).',
  );
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret,
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data')),
  clientDist: path.resolve(process.env.CLIENT_DIST ?? path.join(process.cwd(), '..', 'client', 'dist')),
  cookieDomain: process.env.COOKIE_DOMAIN,
  isProd,
};
