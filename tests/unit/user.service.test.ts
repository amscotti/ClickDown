import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase } from '../test-helper';

const testDb = createTestDatabase();

mock.module('../../src/config/database', () => ({
  db: testDb,
}));

import { userService } from '../../src/services/user.service';

const STRONG_PASSWORD = 'SecurePass123!';
const OTHER_PASSWORD = 'AnotherPass456!';

describe('UserService Unit Tests', () => {
  beforeAll(() => {
    testDb.run('DELETE FROM users');
  });

  beforeEach(() => {
    testDb.run('DELETE FROM sessions');
    testDb.run('DELETE FROM users');
  });

  describe('register', () => {
    test('should create a user, hash the password, and return a session', async () => {
      const result = await userService.register({
        email: 'Alex@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Alex Tester',
      });

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('alex@example.com');
      expect(result.user.displayName).toBe('Alex Tester');
      expect(result.user.avatarSeed).toBeTruthy();
      expect(result.sessionId).toBeTruthy();

      const row = testDb
        .prepare('SELECT password_hash, avatar_seed FROM users WHERE email = ?')
        .get('alex@example.com') as { password_hash: string; avatar_seed: string };

      expect(row.password_hash).not.toBe(STRONG_PASSWORD);
      expect(row.password_hash.length).toBeGreaterThan(20);
      expect(row.avatar_seed).toBe(result.user.avatarSeed);
    });

    test('should reject a duplicate email (case-insensitive)', async () => {
      await userService.register({
        email: 'dup@example.com',
        password: STRONG_PASSWORD,
        displayName: 'First',
      });

      await expect(
        userService.register({
          email: 'DUP@example.com',
          password: OTHER_PASSWORD,
          displayName: 'Second',
        })
      ).rejects.toThrow('Email already registered');
    });

    test('should reject a weak password with combined error messages', async () => {
      await expect(
        userService.register({
          email: 'weak@example.com',
          password: 'short1',
          displayName: 'Weak',
        })
      ).rejects.toThrow(/8 characters/);
    });

    test('should create a session that expires in the future', async () => {
      const { sessionId, user } = await userService.register({
        email: 'session@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Session User',
      });

      const session = testDb
        .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
        .get(sessionId) as { user_id: string; expires_at: string };

      expect(session.user_id).toBe(user.id);
      expect(new Date(session.expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('login', () => {
    test('should authenticate with correct credentials and return a new session', async () => {
      await userService.register({
        email: 'login@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Login User',
      });

      const result = await userService.login('LOGIN@example.com', STRONG_PASSWORD);

      expect(result.user.email).toBe('login@example.com');
      expect(result.sessionId).toBeTruthy();

      const sessions = testDb
        .prepare('SELECT id FROM sessions WHERE user_id = ?')
        .all(result.user.id) as Array<{ id: string }>;
      expect(sessions.length).toBe(2);
    });

    test('should reject an unknown email', async () => {
      await expect(userService.login('nobody@example.com', STRONG_PASSWORD)).rejects.toThrow(
        'Invalid email or password'
      );
    });

    test('should reject an incorrect password', async () => {
      await userService.register({
        email: 'wrongpw@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Wrong PW',
      });

      await expect(
        userService.login('wrongpw@example.com', 'TotallyIncorrect999!')
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('getById', () => {
    test('should return the public user shape', async () => {
      const { user } = await userService.register({
        email: 'getby@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Get By',
      });

      const fetched = userService.getById(user.id);
      expect(fetched.id).toBe(user.id);
      expect(fetched.email).toBe('getby@example.com');
      expect(fetched.displayName).toBe('Get By');
    });

    test('should throw when the user does not exist', () => {
      expect(() => userService.getById('nonexistent-id')).toThrow('User not found');
    });
  });

  describe('deleteSession', () => {
    test('should remove the session from the database', async () => {
      const { sessionId } = await userService.register({
        email: 'logout@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Logout User',
      });

      const before = testDb.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId);
      expect(before).not.toBeNull();

      userService.deleteSession(sessionId);

      const after = testDb.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId);
      expect(after).toBeNull();
    });
  });

  describe('updateProfile', () => {
    test('should update display name and email (lowercased)', async () => {
      const { user } = await userService.register({
        email: 'profile@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Original Name',
      });

      const updated = await userService.updateProfile(user.id, {
        displayName: 'New Name',
        email: 'NEW@Example.com',
        currentPassword: STRONG_PASSWORD,
      });

      expect(updated.displayName).toBe('New Name');
      expect(updated.email).toBe('new@example.com');
    });

    test('should prevent adopting an email already used by another user', async () => {
      const { user: owner } = await userService.register({
        email: 'owner@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Owner',
      });
      const { user: other } = await userService.register({
        email: 'other@example.com',
        password: OTHER_PASSWORD,
        displayName: 'Other',
      });

      await expect(
        userService.updateProfile(other.id, {
          email: 'OWNER@example.com',
          currentPassword: OTHER_PASSWORD,
        })
      ).rejects.toThrow('Email already registered by another user');

      expect(owner.id).toBeTruthy();
    });

    test('should hash and store a new valid password when current password is correct', async () => {
      const { user, sessionId } = await userService.register({
        email: 'pwchange@example.com',
        password: STRONG_PASSWORD,
        displayName: 'PW Change',
      });

      await userService.updateProfile(
        user.id,
        { password: OTHER_PASSWORD, currentPassword: STRONG_PASSWORD },
        { currentSessionId: sessionId }
      );

      const login = await userService.login('pwchange@example.com', OTHER_PASSWORD);
      expect(login.user.id).toBe(user.id);
    });

    test('should require current password when setting a new password', async () => {
      const { user } = await userService.register({
        email: 'needcurrent@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Need Current',
      });

      await expect(
        userService.updateProfile(user.id, { password: OTHER_PASSWORD })
      ).rejects.toThrow(/Current password/);
    });

    test('should reject a weak new password', async () => {
      const { user } = await userService.register({
        email: 'weakpw@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Weak PW',
      });

      await expect(
        userService.updateProfile(user.id, {
          password: '1',
          currentPassword: STRONG_PASSWORD,
        })
      ).rejects.toThrow(/8 characters/);
    });
  });
});
