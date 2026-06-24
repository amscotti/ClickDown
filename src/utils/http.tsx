import type { AuthUser } from '../middleware/auth';
import { getSessionFromRequest } from '../middleware/auth';
import type { Team } from '../models/team.model';
import { teamService } from '../services/team.service';

// ─── Form Parsing ────────────────────────────────────────────────────────────

export async function parseFormData(req: Request): Promise<Record<string, string>> {
  const formData = await req.formData();
  const data: Record<string, string> = {};
  formData.forEach((value, key) => {
    data[key] = value.toString();
  });
  return data;
}

// ─── Cookie / Session Helpers ────────────────────────────────────────────────

function secureCookieAttribute(): string {
  if (process.env.COOKIE_SECURE === 'true') return '; Secure';
  if (process.env.COOKIE_SECURE === 'false') return '';
  return process.env.APP_URL?.startsWith('https://') ? '; Secure' : '';
}

export function setSessionCookie(sessionId: string): string {
  return `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${secureCookieAttribute()}`;
}

export function clearSessionCookie(): string {
  return `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieAttribute()}`;
}

// ─── Flash Toast Helpers ─────────────────────────────────────────────────────

export const TOAST_TYPES = ['success', 'error', 'info'] as const;
export type ToastType = (typeof TOAST_TYPES)[number];

export const ToastType = {
  Success: 'success',
  Error: 'error',
  Info: 'info',
} as const;

export function setFlashToast(type: ToastType, message: string): string {
  const value = encodeURIComponent(JSON.stringify({ type, message }));
  return `flashtoast=${value}; Path=/; SameSite=Lax; Max-Age=60${secureCookieAttribute()}`;
}

export function flashRedirect(
  url: string,
  type: ToastType,
  message: string,
  req?: Request
): Response {
  const cookie = setFlashToast(type, message);
  const isHtmx = req?.headers.get('HX-Request') === 'true';
  if (isHtmx) {
    return new Response('', {
      status: 200,
      headers: { 'HX-Redirect': url, 'Set-Cookie': cookie },
    });
  }
  return new Response('', {
    status: 302,
    headers: { Location: url, 'Set-Cookie': cookie },
  });
}

// ─── HTMX Trigger Header Builders ───────────────────────────────────────────

export function createToastTrigger(type: ToastType, message: string): string {
  return JSON.stringify({ toast: { type, message } });
}

export function taskUpdatedWithToast(type: ToastType, message: string): string {
  return JSON.stringify({ 'task-updated': {}, toast: { type, message } });
}

// ─── Auth Guards ─────────────────────────────────────────────────────────────

export function requireUser(req: Request): AuthUser | Response {
  const user = getSessionFromRequest(req);
  if (!user) return new Response('Unauthorized', { status: 401 });
  return user;
}

export function requireUserOrLogin(req: Request): AuthUser | Response {
  const user = getSessionFromRequest(req);
  if (!user) return new Response('', { status: 302, headers: { Location: '/login' } });
  return user;
}

export function resolveTeamAccess(
  teamSlug: string,
  user: AuthUser
): { team: Team; user: AuthUser } | Response {
  try {
    const team = teamService.getBySlug(teamSlug);
    if (!teamService.isTeamMember(team.id, user.id)) {
      return new Response('Access Denied', { status: 403 });
    }
    return { team, user };
  } catch {
    return new Response('Team not found', { status: 404 });
  }
}

export function resolveTeamAdminAccess(
  teamSlug: string,
  user: AuthUser
): { team: Team; user: AuthUser } | Response {
  try {
    const team = teamService.getBySlug(teamSlug);
    if (!teamService.isTeamAdmin(team.id, user.id)) {
      return new Response('Access Denied', { status: 403 });
    }
    return { team, user };
  } catch {
    return new Response('Team not found', { status: 404 });
  }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY !== 'true') return 'local';
  return req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'local';
}

// ─── Display Helpers ─────────────────────────────────────────────────────────

/**
 * Safe Content-Disposition for user-supplied filenames: an ASCII fallback for
 * legacy clients plus an RFC 5987 UTF-8 parameter for everyone else. Never
 * emits CR/LF or quotes, so header injection is impossible.
 */
export function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.\- ]+/g, '_').replace(/["\r\n]+/g, '') || 'download';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function formatDateDisplay(date: Date | null): string {
  if (!date) return '<span class="no-date">No due date</span>';
  const isOverdue = date < new Date();
  const isoDate = date.toISOString();
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (isOverdue) {
    return `<span class="overdue-badge">Overdue:</span> <time datetime="${isoDate}">${formatted}</time>`;
  }
  return `<time datetime="${isoDate}">${formatted}</time>`;
}

// ─── Static Avatar Generator ─────────────────────────────────────────────────

export function serveAvatar(url: URL): Response {
  const seed = url.pathname.replace('/api/avatar/', '');
  const displayName = url.searchParams.get('name') || seed;
  const bgColor = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'][
    seed.charCodeAt(0) % 6
  ];

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
    .replace(/[<>&'"]/g, (ch) =>
      ch === '<'
        ? '&lt;'
        : ch === '>'
          ? '&gt;'
          : ch === '&'
            ? '&amp;'
            : ch === "'"
              ? '&#39;'
              : '&quot;'
    );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect fill="${bgColor}" width="100" height="100"/>
        <text x="50" y="50" fill="white" text-anchor="middle" dy=".35em" font-size="40" font-family="Inter, system-ui, sans-serif" font-weight="600">${initials}</text>
      </svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
