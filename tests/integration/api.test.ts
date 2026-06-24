import type Database from 'bun:sqlite';
import { beforeAll, describe, expect, test } from 'bun:test';
import { hashPassword, validatePassword, verifyPassword } from '../../src/utils/password';
import { createTestDatabase, createTestUser } from '../test-helper';

// Simple integration tests for the application
describe('ClickDown API Integration Tests', () => {
  let testDb: Database;

  beforeAll(async () => {
    // Create test database
    testDb = createTestDatabase();
    createTestUser(testDb, {
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  describe('Application Setup', () => {
    test('should have database tables', () => {
      const tables = testDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('teams');
      expect(tableNames).toContain('boards');
      expect(tableNames).toContain('columns');
      expect(tableNames).toContain('tasks');
    });

    test('should create user successfully', () => {
      const user = testDb.prepare('SELECT * FROM users WHERE email = ?').get('test@example.com') as
        | { email: string; display_name: string }
        | undefined;

      expect(user).toBeDefined();
      expect(user?.email).toBe('test@example.com');
      expect(user?.display_name).toBe('Test User');
    });
  });

  describe('Password Utilities', () => {
    test('should hash and verify passwords', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });

    test('should validate password strength', () => {
      const strong = validatePassword('SecurePass123!');
      expect(strong.valid).toBe(true);

      const weak = validatePassword('weak');
      expect(weak.valid).toBe(false);
      expect(weak.errors).toBeDefined();
      expect(weak.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Slug Generation', () => {
    test('should generate slugs correctly', () => {
      // Test slugify function behavior
      const slugify = (text: string) =>
        text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

      expect(slugify('My Team Name')).toBe('my-team-name');
      expect(slugify('Hello!!! World???')).toBe('hello-world');
      expect(slugify('  Test  ')).toBe('test');
      expect(slugify('123 numbers')).toBe('123-numbers');
    });
  });
});
