import type { ZodType } from 'zod';
import { renderInlineError } from '../components/error';
import { createToastTrigger } from './http';

export function validateBody<T>(
  data: Record<string, string>,
  schema: ZodType<T>,
  opts?: { toast?: boolean }
): T | Response {
  const result = schema.safeParse(data);
  if (!result.success) {
    if (opts?.toast) {
      // Inline-edit (hx-patch) controls target themselves; swapping HTML into an
      // <input>/<textarea> would break it. Return a no-swap error toast instead.
      const message = result.error.issues[0]?.message ?? 'Invalid input';
      return new Response(null, {
        status: 400,
        headers: { 'HX-Reswap': 'none', 'HX-Trigger': createToastTrigger('error', message) },
      });
    }
    const errors = result.error.issues.map((i) => renderInlineError(i.message)).join('\n');
    return new Response(errors, {
      status: 400,
      headers: { 'Content-Type': 'text/html', 'HX-Reswap': 'innerHTML' },
    });
  }
  return result.data;
}

/** Build a single escaped inline error paragraph for catch-block HTML responses. */
export function errorHtml(message: string): string {
  return renderInlineError(message);
}
