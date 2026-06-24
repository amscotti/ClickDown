import { nanoid } from 'nanoid';
import type { z } from 'zod';
import { db } from '../config/database';
import type { User } from '../models/user.model';
import type { registerSchema } from '../schemas/auth';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { hashPassword, validatePassword, verifyPassword } from '../utils/password';

export type CreateUserInput = Omit<z.infer<typeof registerSchema>, 'confirmPassword'>;

export interface AuthResponse {
  user: PublicUser;
  sessionId: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarSeed: string;
}

export class UserService {
  // Create a new user
  async register(input: CreateUserInput): Promise<AuthResponse> {
    const { email, password, displayName } = input;

    // Defense-in-depth: validate even if route layer already checked
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('Invalid email format');
    }
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      throw new ValidationError(pwCheck.errors.join(', '));
    }

    // Check if email already exists
    const existingUser = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email.toLowerCase());

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Create user
    const userId = nanoid();
    const passwordHash = await hashPassword(password);
    const avatarSeed = nanoid(10);

    this.purgeExpiredSessions();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    db.transaction(() => {
      db.prepare(
        'INSERT INTO users (id, email, password_hash, display_name, avatar_seed) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, email.toLowerCase(), passwordHash, displayName, avatarSeed);
      db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
        sessionId,
        userId,
        expiresAt.toISOString()
      );
    })();

    // Get user data
    const user = this.getById(userId);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarSeed: user.avatarSeed,
      },
      sessionId,
    };
  }

  // Login user
  async login(email: string, password: string): Promise<AuthResponse> {
    const user = db
      .prepare(
        `
        SELECT id, email, password_hash as passwordHash, display_name as displayName,
               avatar_seed as avatarSeed, created_at as createdAt, updated_at as updatedAt
        FROM users WHERE email = ?
      `
      )
      .get(email.toLowerCase()) as User | undefined;

    if (!user) {
      throw new ValidationError('Invalid email or password');
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      throw new ValidationError('Invalid email or password');
    }

    // Create session
    const sessionId = this.createSession(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarSeed: user.avatarSeed,
      },
      sessionId,
    };
  }

  // Get user by ID
  getById(userId: string): PublicUser {
    const user = db
      .prepare('SELECT id, email, display_name, avatar_seed FROM users WHERE id = ?')
      .get(userId) as
      | { id: string; email: string; display_name: string; avatar_seed: string }
      | undefined;

    if (!user) {
      throw new NotFoundError('User');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarSeed: user.avatar_seed,
    };
  }

  // Create session for user
  private createSession(userId: string): string {
    // Opportunistic cleanup of expired sessions (local SQLite, no external job runner)
    this.purgeExpiredSessions();

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
      sessionId,
      userId,
      expiresAt.toISOString()
    );

    return sessionId;
  }

  // Delete session (logout)
  deleteSession(sessionId: string): void {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  /** Delete all sessions for a user except an optional current session. */
  deleteAllSessionsForUser(userId: string, exceptSessionId?: string): void {
    if (exceptSessionId) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptSessionId);
    } else {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    }
  }

  /** Remove expired session rows so the table does not grow forever. */
  purgeExpiredSessions(): void {
    // Use expires_at directly so the idx_sessions_expires index is used.
    // Wrapping in datetime() would force a full table scan.
    db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
  }

  // Update user profile details
  async updateProfile(
    userId: string,
    input: {
      displayName?: string;
      email?: string;
      password?: string;
      currentPassword?: string;
    },
    options?: { currentSessionId?: string }
  ): Promise<PublicUser> {
    const { displayName, email, password, currentPassword } = input;
    const currentUser = db
      .prepare('SELECT email, password_hash FROM users WHERE id = ?')
      .get(userId) as { email: string; password_hash: string } | undefined;
    if (!currentUser) throw new NotFoundError('User');

    const emailChanged = email !== undefined && email.trim().toLowerCase() !== currentUser.email;
    if (emailChanged) {
      if (!currentPassword || !(await verifyPassword(currentPassword, currentUser.password_hash))) {
        throw new ValidationError('Current password is required to change your email');
      }
    }

    // Check email uniqueness if provided
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError('Invalid email format');
      }
      const existingUser = db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(email.toLowerCase(), userId);

      if (existingUser) {
        throw new ConflictError('Email already registered by another user');
      }
    }

    if (displayName !== undefined && displayName.trim() !== '') {
      db.prepare(
        'UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(displayName.trim(), userId);
    }

    if (email !== undefined && email.trim() !== '') {
      db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        email.trim().toLowerCase(),
        userId
      );
    }

    if (password !== undefined && password.trim() !== '') {
      if (!currentPassword) {
        throw new ValidationError('Current password is required to set a new password');
      }
      const currentOk = await verifyPassword(currentPassword, currentUser.password_hash);
      if (!currentOk) {
        throw new ValidationError('Current password is incorrect');
      }

      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        throw new ValidationError(pwCheck.errors.join(', '));
      }
      const passwordHash = await hashPassword(password);
      db.prepare(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(passwordHash, userId);

      // Invalidate every other session after a password change
      this.deleteAllSessionsForUser(userId, options?.currentSessionId);
    }

    return this.getById(userId);
  }
}

export const userService = new UserService();
