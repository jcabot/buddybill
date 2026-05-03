import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema, signupSchema } from '@buddysplit/shared';
import { env } from '../env.js';
import { conflict, unauthorized } from '../errors.js';
import { ah } from '../middleware/async.js';
import { SESSION_COOKIE, authRequired } from '../middleware/auth.js';
import { createUser, findUserByEmail, findUserById } from '../repositories/usersRepo.js';
import { newUserId } from '../util/ids.js';
import { signSession } from '../util/jwt.js';
import { hashPassword, verifyPassword } from '../util/passwords.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function setSessionCookie(res: import('express').Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    domain: env.cookieDomain,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export const authRouter = Router();

authRouter.post(
  '/signup',
  authLimiter,
  ah(async (req, res) => {
    const { email, password } = signupSchema.parse(req.body);
    const existing = await findUserByEmail(email);
    if (existing) throw conflict('Email is already registered');
    const id = newUserId();
    const passwordHash = await hashPassword(password);
    await createUser({ id, email, passwordHash, createdAt: new Date().toISOString() });
    const token = signSession({ uid: id, email });
    setSessionCookie(res, token);
    res.status(201).json({ user: { id, email } });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  ah(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await findUserByEmail(email);
    if (!user) throw unauthorized('Invalid email or password');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid email or password');
    const token = signSession({ uid: user.id, email: user.email });
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, email: user.email } });
  }),
);

authRouter.post(
  '/logout',
  ah(async (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  authRequired,
  ah(async (req, res) => {
    const id = req.user!.uid;
    const user = await findUserById(id);
    if (!user) throw unauthorized();
    res.json({ user: { id: user.id, email: user.email } });
  }),
);
