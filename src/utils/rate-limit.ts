const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const MAX_KEYS = 10_000;
const DISABLED = process.env.E2E_TEST === 'true';

function prune(now: number): void {
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
  while (attempts.size >= MAX_KEYS) {
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
}

export function checkRateLimit(key: string): boolean {
  if (DISABLED) return true;
  const now = Date.now();
  if (attempts.size >= MAX_KEYS) prune(now);
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

export function resetRateLimit(): void {
  attempts.clear();
}

export function clearRateLimit(key: string): void {
  attempts.delete(key);
}
