import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'validation', message: 'Invalid request body', details: err.flatten() },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  const status =
    typeof (err as { status?: number })?.status === 'number'
      ? (err as { status: number }).status
      : 500;
  const code = (err as { code?: string })?.code ?? 'internal';
  const message =
    err instanceof Error ? err.message : 'Internal server error';
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(status).json({ error: { code, message } });
}
