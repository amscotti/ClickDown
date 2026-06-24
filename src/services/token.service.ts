import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { db } from '../config/database';
import type { AuthUser } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  /** First 11 chars of the token (e.g. "cd_ab12cd34") for identification. */
  prefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mapRow(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    createdAt: new Date(row.created_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

export class TokenService {
  /** Create a new API token. The full plaintext token is returned ONCE — only
   * its SHA-256 hash is persisted. */
  create(userId: string, name: string): { token: string; record: ApiToken } {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) {
      throw new ValidationError('Token name is required (max 60 chars)');
    }

    const token = `cd_${nanoid(32)}`;
    const id = nanoid();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, userId, trimmed, hashToken(token), token.slice(0, 11), now);

    return {
      token,
      record: {
        id,
        userId,
        name: trimmed,
        prefix: token.slice(0, 11),
        lastUsedAt: null,
        createdAt: new Date(now),
        revokedAt: null,
      },
    };
  }

  /** List non-revoked tokens for a user (plaintext is never returned). */
  listForUser(userId: string): ApiToken[] {
    const rows = db
      .prepare(
        `SELECT * FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC`
      )
      .all(userId) as ApiTokenRow[];
    return rows.map(mapRow);
  }

  /** Revoke a token. No-op if already revoked; throws if not found or not owned. */
  revoke(userId: string, tokenId: string): void {
    const row = db.prepare('SELECT user_id FROM api_tokens WHERE id = ?').get(tokenId) as
      | { user_id: string }
      | undefined;
    if (!row || row.user_id !== userId) throw new NotFoundError('Token');
    db.prepare(`UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).run(
      new Date().toISOString(),
      tokenId
    );
  }

  /**
   * Resolve a bearer token to its owning user. Returns null for invalid,
   * revoked, or unknown tokens. Updates last_used_at on success (throttled
   * to one write per minute per token to avoid a DB write on every call).
   */
  authenticate(token: string): AuthUser | null {
    if (!token.startsWith('cd_')) return null;
    const row = db
      .prepare(
        `SELECT t.id as token_id, t.last_used_at, u.id, u.display_name, u.email, u.avatar_seed
         FROM api_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.revoked_at IS NULL`
      )
      .get(hashToken(token)) as
      | {
          token_id: string;
          last_used_at: string | null;
          id: string;
          display_name: string;
          email: string;
          avatar_seed: string;
        }
      | undefined;
    if (!row) return null;

    const oneMinuteAgo = Date.now() - 60_000;
    if (!row.last_used_at || new Date(row.last_used_at).getTime() < oneMinuteAgo) {
      db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        row.token_id
      );
    }

    return {
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      avatarSeed: row.avatar_seed,
    };
  }
}

export const tokenService = new TokenService();
