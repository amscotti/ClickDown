import { z } from 'zod';

const nameMin = 'Name must be at least 2 characters';

const optionalStr = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), schema.optional());

// ─── Board CRUD ──────────────────────────────────────────────────────────────

export const createBoardSchema = z.object({
  name: z.string().trim().min(2, nameMin).max(100),
  description: optionalStr(z.string().trim().max(500)),
});

export const updateBoardSchema = z.object({
  name: z.string().trim().min(2, nameMin).max(100).optional(),
  description: optionalStr(z.string().trim().max(500)),
});

// ─── Column CRUD ─────────────────────────────────────────────────────────────

export const createColumnSchema = z.object({
  name: z.string().trim().min(2, 'Column name must be at least 2 characters').max(50),
  color: optionalStr(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')),
  wipLimit: optionalStr(z.coerce.number().int().min(0, 'WIP limit must be >= 0').max(999)),
});

export const updateColumnSchema = z.object({
  name: z.string().trim().min(2, 'Column name must be at least 2 characters').max(50).optional(),
  color: optionalStr(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')),
  wipLimit: optionalStr(z.coerce.number().int().min(0, 'WIP limit must be >= 0').max(999)),
});

// ─── Reorder ─────────────────────────────────────────────────────────────────

export const reorderColumnsSchema = z.object({
  columnIds: z
    .string()
    .min(1, 'Column IDs are required')
    .transform((v) => v.split(',').filter((id): id is string => id.length > 0)),
});

export const reorderTasksSchema = z.object({
  taskIds: z
    .string()
    .min(1, 'Task IDs are required')
    .transform((v) => v.split(',').filter((id): id is string => id.length > 0)),
});
