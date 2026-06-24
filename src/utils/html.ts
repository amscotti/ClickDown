import { isAbsolute, join, relative as pathRelative, resolve } from 'node:path';

/** Alpine.js attribute passthrough helper for Kita JSX. */
export function alpine(
  attrs: Record<string, string | boolean | undefined>
): Record<string, string | boolean | undefined> {
  return attrs;
}

/**
 * HTML-escape untrusted text before interpolating into HTML strings.
 * Kita JSX string children are raw unless their native element uses `safe`,
 * so use this helper for hand-built HTML fragments.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Allow only same-origin relative paths for post-login redirects.
 * Rejects protocol-relative (`//evil.com`), absolute URLs, and backslashes.
 */
export function safeRedirectPath(path: string | null | undefined, fallback = '/dashboard'): string {
  if (!path) return fallback;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//')) return fallback;
  if (trimmed.includes('://') || trimmed.includes('\\') || trimmed.includes('\0')) return fallback;
  // Block control characters without a control-char regex (Biome disallows those)
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code === 127) return fallback;
  }
  return trimmed;
}

/**
 * Security headers for the fully local runtime asset policy. Inline scripts
 * and Alpine expressions still require unsafe-inline/unsafe-eval for now.
 */
export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
  };
}

/** Merge security headers onto an existing HeadersInit. */
export function withSecurityHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  for (const [k, v] of Object.entries(securityHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return headers;
}

/** Canonical browser-facing origin. APP_URL is only needed behind a reverse proxy. */
export function externalOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) return new URL(req.url).origin;
  try {
    return new URL(configured).origin;
  } catch {
    throw new Error('APP_URL must be an absolute URL');
  }
}

/**
 * Resolve a static asset under `public/` safely.
 * Returns null if the path escapes the public directory or is not allowed.
 */
export function resolvePublicPath(urlPathname: string, publicDir: string): string | null {
  const allowed =
    urlPathname === '/favicon.svg' ||
    urlPathname.startsWith('/css/') ||
    urlPathname.startsWith('/js/');
  if (!allowed) return null;

  // Reject path traversal and null bytes before joining
  if (urlPathname.includes('..') || urlPathname.includes('\0') || urlPathname.includes('\\')) {
    return null;
  }

  const relative = urlPathname.replace(/^\/+/, '');
  if (!relative || relative.includes('..')) return null;

  // Join relative segments only so an absolute pathname cannot escape public/
  const candidate = join(publicDir, relative);
  const resolvedPublic = resolve(publicDir);
  const resolvedFile = resolve(candidate);
  const rel = pathRelative(resolvedPublic, resolvedFile);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;

  return resolvedFile;
}
