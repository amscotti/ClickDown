import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase, createTestUser } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { teamService } from '../../src/services/team.service';

describe('TeamService invite tokens', () => {
  let ownerId: string;

  beforeEach(() => {
    testDb.run('DELETE FROM team_members');
    testDb.run('DELETE FROM teams');
    testDb.run('DELETE FROM users');
    ownerId = createTestUser(testDb, {
      id: 'invite-owner',
      email: 'invite-owner@example.com',
      displayName: 'Invite Owner',
    });
  });

  test('createTeam generates a non-empty invite token', async () => {
    const team = await teamService.createTeam({
      name: 'Token Team',
      ownerId,
    });
    expect(team.inviteToken).toBeTruthy();
    expect((team.inviteToken ?? '').length).toBeGreaterThanOrEqual(16);
  });

  test('getOrCreateInviteToken returns the stored token', async () => {
    const team = await teamService.createTeam({ name: 'Stable Token', ownerId });
    const a = teamService.getOrCreateInviteToken(team.id);
    const b = teamService.getOrCreateInviteToken(team.id);
    expect(a).toBe(b);
    expect(a).toBe(team.inviteToken ?? '');
  });

  test('getOrCreateInviteToken backfills null tokens on legacy rows', async () => {
    const team = await teamService.createTeam({ name: 'Legacy Token', ownerId });
    testDb.prepare('UPDATE teams SET invite_token = NULL WHERE id = ?').run(team.id);

    const token = teamService.getOrCreateInviteToken(team.id);
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThanOrEqual(16);

    const row = testDb.prepare('SELECT invite_token FROM teams WHERE id = ?').get(team.id) as {
      invite_token: string;
    };
    expect(row.invite_token).toBe(token);
  });

  test('validateInviteToken accepts the real token and rejects wrong ones', async () => {
    const team = await teamService.createTeam({ name: 'Validate Token', ownerId });
    const token = teamService.getOrCreateInviteToken(team.id);

    expect(teamService.validateInviteToken(team.id, token)).toBe(true);
    expect(teamService.validateInviteToken(team.id, 'totally-wrong')).toBe(false);
    expect(teamService.validateInviteToken(team.id, null)).toBe(false);
    expect(teamService.validateInviteToken(team.id, '')).toBe(false);
  });
});
