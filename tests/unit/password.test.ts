import { describe, expect, test } from 'bun:test';
import { hashPassword, validatePassword, verifyPassword } from '../../src/utils/password';

describe('Password Utilities Unit Tests', () => {
  describe('hashPassword / verifyPassword', () => {
    test('should produce a bcrypt hash distinct from the plaintext', async () => {
      const hash = await hashPassword('MySecret123!');

      expect(hash).not.toBe('MySecret123!');
      expect(hash.startsWith('$2')).toBe(true);
      expect(hash.length).toBeGreaterThan(20);
    });

    test('should produce unique hashes for the same password (salted)', async () => {
      const a = await hashPassword('SamePassword1!');
      const b = await hashPassword('SamePassword1!');
      expect(a).not.toBe(b);
    });

    test('should verify the correct password', async () => {
      const hash = await hashPassword('CorrectPass1!');
      expect(await verifyPassword('CorrectPass1!', hash)).toBe(true);
    });

    test('should reject an incorrect password', async () => {
      const hash = await hashPassword('CorrectPass1!');
      expect(await verifyPassword('WrongPass1!', hash)).toBe(false);
      expect(await verifyPassword('correctpass1!', hash)).toBe(false);
    });

    test('should reject an empty password against a real hash', async () => {
      const hash = await hashPassword('CorrectPass1!');
      expect(await verifyPassword('', hash)).toBe(false);
    });
  });

  describe('validatePassword', () => {
    test('should accept a strong password', () => {
      const result = validatePassword('StrongPass123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should flag a password that is too short', () => {
      const result = validatePassword('Aa1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    test('should flag a password exceeding the max length', () => {
      const result = validatePassword('A1'.repeat(70));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be less than 128 characters');
    });

    test('should flag a missing lowercase letter', () => {
      const result = validatePassword('ALLUPPER123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    test('should flag a missing uppercase letter', () => {
      const result = validatePassword('alllower123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    test('should flag a missing number', () => {
      const result = validatePassword('NoNumbers!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    test('should collect every applicable error at once', () => {
      const result = validatePassword('a');
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.valid).toBe(false);
    });
  });
});
