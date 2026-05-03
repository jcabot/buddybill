import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from './constants.js';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(128);

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: currencySchema,
});

export const renameGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const memberInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const activityInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const splitSchema = z.record(z.string(), z.number().nonnegative().finite());

export const invoiceInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  concept: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(''),
  amount: z.number().positive().finite(),
  payerId: z.string().min(1),
  split: splitSchema.optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type RenameGroupInput = z.infer<typeof renameGroupSchema>;
export type MemberInput = z.infer<typeof memberInputSchema>;
export type ActivityInput = z.infer<typeof activityInputSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
