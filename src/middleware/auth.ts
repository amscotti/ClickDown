import { db } from '../config/database';
import { parseCookie } from '../utils/cookie';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarSeed: string;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
}

// Get session from cookie and validate
export function getSessionFromRequest(req: Request): AuthUser | null {
  const cookieHeader = req.headers.get('Cookie');
  const sessionId = parseCookie(cookieHeader, 'session_id');

  if (!sessionId) {
    return null;
  }

  const stmt = db.prepare(`
    SELECT s.*, u.id as userId, u.email, u.display_name as displayName, u.avatar_seed as avatarSeed
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
  `);

  const row = stmt.get(sessionId) as
    | {
        id: string;
        userId: string;
        email: string;
        displayName: string;
        avatarSeed: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    avatarSeed: row.avatarSeed,
  };
}
