import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase, createTestUser } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { tokenService } from '../../src/services/token.service';
import { ValidationError } from '../../src/utils/errors';

describe('TokenService', () => {
  let userId: string;

  beforeEach(() => {
    testDb.run('DELETE FROM api_tokens');
    testDb.run('DELETE FROM users');
    userId = createTestUser(testDb, {
      id: 'token-user',
      email: 'token@example.com',
      displayName: 'Token User',
    });
  });

  test('create returns a cd_ prefixed token and stores only the hash', () => {
    const { token, record } = tokenService.create(userId, 'my-agent');
    expect(token.startsWith('cd_')).toBe(true);
    expect(token.length).toBeGreaterThan(20);
    expect(record.name).toBe('my-agent');
    expect(record.prefix).toBe(token.slice(0, 11));
    // The DB must not contain the plaintext token.
    const row = testDb.prepare('SELECT token_hash FROM api_tokens WHERE id = ?').get(record.id) as {
      token_hash: string;
    };
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toHaveLength(64); // sha256 hex
  });

  test('create validates the name', () => {
    expect(() => tokenService.create(userId, '   ')).toThrow(ValidationError);
    expect(() => tokenService.create(userId, 'x'.repeat(61))).toThrow(ValidationError);
  });

  test('listForUser returns only active tokens for that user', () => {
    tokenService.create(userId, 'one');
    const second = tokenService.create(userId, 'two');
    tokenService.revoke(userId, second.record.id);

    const otherUser = createTestUser(testDb, {
      id: 'other-user',
      email: 'other@example.com',
    });
    tokenService.create(otherUser, 'other');

    const list = tokenService.listForUser(userId);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('one');
  });

  test('authenticate resolves a valid token to its user', () => {
    const { token } = tokenService.create(userId, 'agent');
    const user = tokenService.authenticate(token);
    expect(user).not.toBeNull();
    expect(user?.id).toBe(userId);
    expect(user?.email).toBe('token@example.com');
  });

  test('authenticate rejects wrong, malformed, and revoked tokens', () => {
    const { token, record } = tokenService.create(userId, 'agent');

    expect(tokenService.authenticate('cd_wrongwrongwrong')).toBeNull();
    expect(tokenService.authenticate('not-a-token')).toBeNull();
    expect(tokenService.authenticate('')).toBeNull();

    tokenService.revoke(userId, record.id);
    expect(tokenService.authenticate(token)).toBeNull();
  });

  test('authenticate updates last_used_at', () => {
    const { token, record } = tokenService.create(userId, 'agent');
    expect(record.lastUsedAt).toBeNull();
    tokenService.authenticate(token);
    const list = tokenService.listForUser(userId);
    expect(list[0]?.lastUsedAt).not.toBeNull();
  });

  test('revoke is scoped to the owning user', () => {
    const { record } = tokenService.create(userId, 'agent');
    const otherUser = createTestUser(testDb, {
      id: 'other-user',
      email: 'other@example.com',
    });
    expect(() => tokenService.revoke(otherUser, record.id)).toThrow();
    // Still valid for the real owner.
    const list = tokenService.listForUser(userId);
    expect(list).toHaveLength(1);
  });

  test('tokens are deleted when the user is deleted (cascade)', () => {
    tokenService.create(userId, 'agent');
    testDb.run('DELETE FROM users WHERE id = ?', [userId]);
    const rows = testDb.prepare('SELECT * FROM api_tokens').all();
    expect(rows).toHaveLength(0);
  });
});
