import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase, createTestUser } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { getSessionFromRequest } from '../../src/middleware/auth';

function sessionReq(cookie?: string): Request {
  return new Request('http://localhost/dashboard', {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

describe('Auth middleware', () => {
  beforeEach(() => {
    testDb.run('DELETE FROM sessions');
  });

  test('returns null when there is no Cookie header', () => {
    expect(getSessionFromRequest(sessionReq())).toBeNull();
  });

  test('returns null when the session_id does not exist', () => {
    expect(getSessionFromRequest(sessionReq('session_id=does-not-exist'))).toBeNull();
  });

  test('returns the user for a valid (unexpired) session', () => {
    const userId = createTestUser(testDb, {
      id: 'auth-user',
      email: 'auth@test.com',
      displayName: 'Auth User',
      avatarSeed: 'seed',
    });
    const future = new Date();
    future.setDate(future.getDate() + 7);
    testDb
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run('valid-session', userId, future.toISOString());

    const user = getSessionFromRequest(sessionReq('session_id=valid-session'));
    expect(user).not.toBeNull();
    expect(user?.id).toBe(userId);
    expect(user?.displayName).toBe('Auth User');
  });

  test('returns null for an expired session', () => {
    const userId = createTestUser(testDb, {
      id: 'exp-user',
      email: 'exp@test.com',
      displayName: 'Exp',
      avatarSeed: 's',
    });
    const past = new Date();
    past.setDate(past.getDate() - 1);
    testDb
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run('expired-session', userId, past.toISOString());

    expect(getSessionFromRequest(sessionReq('session_id=expired-session'))).toBeNull();
  });
});
