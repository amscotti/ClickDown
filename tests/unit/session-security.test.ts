import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { getSessionFromRequest } from '../../src/middleware/auth';
import { userService } from '../../src/services/user.service';

const PASSWORD = 'SecurePass123!';

describe('UserService session security', () => {
  beforeEach(() => {
    testDb.run('DELETE FROM sessions');
    testDb.run('DELETE FROM users');
  });

  test('purgeExpiredSessions removes only expired rows', async () => {
    const { user, sessionId: live } = await userService.register({
      email: 'purge@example.com',
      password: PASSWORD,
      displayName: 'Purge User',
    });

    testDb
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run('expired-sess', user.id, '2000-01-01T00:00:00.000Z');

    userService.purgeExpiredSessions();

    const rows = testDb.prepare('SELECT id FROM sessions WHERE user_id = ?').all(user.id) as Array<{
      id: string;
    }>;
    expect(rows.map((r) => r.id)).toEqual([live]);
  });

  test('deleteAllSessionsForUser keeps the current session when provided', async () => {
    const { user, sessionId: a } = await userService.register({
      email: 'multi@example.com',
      password: PASSWORD,
      displayName: 'Multi Sess',
    });
    const b = (await userService.login('multi@example.com', PASSWORD)).sessionId;

    userService.deleteAllSessionsForUser(user.id, a);

    const rows = testDb.prepare('SELECT id FROM sessions WHERE user_id = ?').all(user.id) as Array<{
      id: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(a);
    expect(rows.find((r) => r.id === b)).toBeUndefined();
  });

  test('rejects an ISO session that expired earlier on the current UTC date', async () => {
    const { user } = await userService.register({
      email: 'boundary@example.com',
      password: PASSWORD,
      displayName: 'Boundary User',
    });
    const expiredId = 'same-day-expired';
    testDb
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(expiredId, user.id, new Date(Date.now() - 60_000).toISOString());

    const request = new Request('http://localhost/dashboard', {
      headers: { Cookie: `session_id=${expiredId}` },
    });
    expect(getSessionFromRequest(request)).toBeNull();
  });

  test('password change with wrong current password fails', async () => {
    const { user } = await userService.register({
      email: 'wrongcur@example.com',
      password: PASSWORD,
      displayName: 'Wrong Cur',
    });

    await expect(
      userService.updateProfile(user.id, {
        password: 'NewPass999!',
        currentPassword: 'NotTheRight1!',
      })
    ).rejects.toThrow(/incorrect/i);
  });
});
