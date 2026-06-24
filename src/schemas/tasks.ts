import { z } from 'zod';
import { TASK_PRIORITIES, TaskPriority } from '../models/task.model';

const titleMin = 'Title must be at least 2 characters';

const optionalStr = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), schema.optional());

// ─── Create task ─────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  columnId: z.string().min(1, 'Column is required'),
  title: z.string().trim().min(2, titleMin).max(200),
  description: optionalStr(z.string().max(5000)),
  priority: z.enum(TASK_PRIORITIES).catch(TaskPriority.Medium),
  assigneeId: z.preprocess(
    (v) => (v === '' || v === 'none' || v === undefined ? undefined : v),
    z.string().optional()
  ),
  dueDate: optionalStr(z.coerce.date()),
});

// ─── Task PATCH fields (inline editing) ──────────────────────────────────────

export const patchTitleSchema = z.object({
  title: z.string().trim().min(2, titleMin).max(200),
});

export const patchDescriptionSchema = z.object({
  description: optionalStr(z.string().max(5000)),
});

export const patchPrioritySchema = z.object({
  priority: z.enum(TASK_PRIORITIES, { message: 'Invalid priority' }),
});

export const patchAssigneeSchema = z.object({
  assigneeId: z.preprocess(
    (v) => (v === '' || v === 'none' || v === undefined ? undefined : v),
    z.string().optional()
  ),
});

export const patchDueDateSchema = z.object({
  dueDate: optionalStr(z.coerce.date()),
});

// ─── Move task ───────────────────────────────────────────────────────────────

export const moveTaskSchema = z.object({
  columnId: z.string().min(1, 'Column ID is required'),
});

// ─── Bulk delete ─────────────────────────────────────────────────────────────

export const bulkDeleteSchema = z.object({
  taskIds: z
    .string()
    .min(1, 'No tasks selected')
    .transform((v) => v.split(',').filter((id): id is string => id.length > 0)),
});

// ─── Checklist ───────────────────────────────────────────────────────────────

export const checklistAddSchema = z.object({
  text: z.string().trim().min(1, 'Item text required').max(500),
});
