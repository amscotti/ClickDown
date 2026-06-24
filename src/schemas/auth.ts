import { z } from 'zod';

// ─── Shared field helpers ────────────────────────────────────────────────────

/** Converts empty string or undefined to undefined, so optional fields work with FormData. */
const optionalStr = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), schema.optional());

// ─── Password complexity ─────────────────────────────────────────────────────

export const passwordSchema = z.string().superRefine((val, ctx) => {
  if (val.length < 8)
    ctx.addIssue({ code: 'custom', message: 'Password must be at least 8 characters long' });
  if (val.length > 128)
    ctx.addIssue({ code: 'custom', message: 'Password must be less than 128 characters' });
  if (!/[a-z]/.test(val))
    ctx.addIssue({
      code: 'custom',
      message: 'Password must contain at least one lowercase letter',
    });
  if (!/[A-Z]/.test(val))
    ctx.addIssue({
      code: 'custom',
      message: 'Password must contain at least one uppercase letter',
    });
  if (!/\d/.test(val))
    ctx.addIssue({ code: 'custom', message: 'Password must contain at least one number' });
  if (!/[^a-zA-Z0-9]/.test(val))
    ctx.addIssue({
      code: 'custom',
      message: 'Password must contain at least one special character',
    });
});

// ─── Auth schemas ────────────────────────────────────────────────────────────

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email format'),
    password: passwordSchema,
    displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(50),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const profileUpdateSchema = z
  .object({
    displayName: optionalStr(z.string().trim().min(2).max(50)),
    email: optionalStr(z.string().trim().toLowerCase().email()),
    password: optionalStr(passwordSchema),
    confirmPassword: z.string().optional(),
    currentPassword: z.string().optional(),
  })
  .refine((d) => !d.password || d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => !d.password || (d.currentPassword && d.currentPassword.length > 0), {
    message: 'Current password is required to set a new password',
    path: ['currentPassword'],
  });
