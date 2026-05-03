import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';
import { forbidden } from '../errors.js';

const CSRF_COOKIE = 'bs_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function newToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Double-submit CSRF: a non-httpOnly cookie holds a token; clients echo it in a
 * header on unsafe methods. Both must match. Login/signup are exempt because
 * they have no session yet.
 */
export function csrf(exemptPaths: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.cookies?.[CSRF_COOKIE]) {
      const tok = newToken();
      res.cookie(CSRF_COOKIE, tok, {
        httpOnly: false,
        secure: env.isProd,
        sameSite: 'lax',
        path: '/',
      });
      req.cookies = { ...req.cookies, [CSRF_COOKIE]: tok };
    }

    if (SAFE_METHODS.has(req.method)) return next();
    if (exemptPaths.some((p) => req.path.startsWith(p))) return next();

    const cookieTok = req.cookies?.[CSRF_COOKIE];
    const headerTok = req.header(CSRF_HEADER);
    if (!cookieTok || !headerTok || cookieTok !== headerTok) {
      return next(forbidden('CSRF token missing or invalid'));
    }
    next();
  };
}
