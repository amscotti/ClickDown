export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const eq = cookie.indexOf('=');
    if (eq === -1) continue;
    const key = cookie.slice(0, eq);
    const value = cookie.slice(eq + 1);
    if (key === name) {
      return value || null;
    }
  }

  return null;
}
