import type { NextFunction, Request, Response } from 'express';
import { verifySession, type SessionPayload } from '../util/jwt.js';
import { unauthorized } from '../errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionPayload;
  }
}

export const SESSION_COOKIE = 'bsid';

export function authRequired(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(unauthorized());
  const session = verifySession(token);
  if (!session) return next(unauthorized());
  req.user = session;
  next();
}

export function authOptional(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const session = verifySession(token);
  if (session) req.user = session;
  next();
}
