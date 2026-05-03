import jwt from 'jsonwebtoken';
import { env } from '../env.js';

const TOKEN_TTL = '30d';

export interface SessionPayload {
  uid: string;
  email: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (typeof decoded.uid !== 'string' || typeof decoded.email !== 'string') return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
