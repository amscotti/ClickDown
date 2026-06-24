import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { profileUpdateSchema } from '../../src/schemas/auth';
import { joinTeamSchema, roleChangeSchema } from '../../src/schemas/teams';
import { validateBody } from '../../src/utils/validation';

describe('joinTeamSchema', () => {
  test('parses a full invite URL into slug + token', () => {
    const result = joinTeamSchema.safeParse({
      teamSlug: 'http://localhost:3000/teams/engineering/join?token=abc123secret',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.teamSlug).toBe('engineering');
    expect(result.data.inviteToken).toBe('abc123secret');
  });

  test('accepts slug and inviteToken as separate fields', () => {
    const result = joinTeamSchema.safeParse({
      teamSlug: 'my-team',
      inviteToken: 'tok-xyz',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.teamSlug).toBe('my-team');
    expect(result.data.inviteToken).toBe('tok-xyz');
  });

  test('rejects slug without a token', () => {
    const result = joinTeamSchema.safeParse({ teamSlug: 'only-slug' });
    expect(result.success).toBe(false);
  });

  test('rejects empty input', () => {
    const result = joinTeamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('roleChangeSchema', () => {
  test('allows member/admin changes but rejects ownership changes', () => {
    expect(roleChangeSchema.safeParse({ role: 'member' }).success).toBe(true);
    expect(roleChangeSchema.safeParse({ role: 'admin' }).success).toBe(true);
    expect(roleChangeSchema.safeParse({ role: 'owner' }).success).toBe(false);
  });
});

describe('validateBody toast mode', () => {
  test('returns a no-swap error toast for inline-edit endpoints', () => {
    const res = validateBody({ title: 'x' }, z.object({ title: z.string().min(2) }), {
      toast: true,
    });
    expect(res).toBeInstanceOf(Response);
    if (!(res instanceof Response)) return;
    expect(res.status).toBe(400);
    expect(res.headers.get('HX-Reswap')).toBe('none');
    const trigger = res.headers.get('HX-Trigger') ?? '';
    expect(trigger).toContain('toast');
    expect(trigger).toContain('error');
  });

  test('default mode still returns inline HTML errors', async () => {
    const res = validateBody({ title: 'x' }, z.object({ title: z.string().min(2) }));
    expect(res).toBeInstanceOf(Response);
    if (!(res instanceof Response)) return;
    expect(res.headers.get('HX-Reswap')).toBe('innerHTML');
    expect(await res.text()).toContain('inline-error');
  });
});

describe('profileUpdateSchema password rules', () => {
  test('requires currentPassword when setting a new password', () => {
    const result = profileUpdateSchema.safeParse({
      password: 'NewPass123!',
      confirmPassword: 'NewPass123!',
    });
    expect(result.success).toBe(false);
  });

  test('accepts password change with currentPassword', () => {
    const result = profileUpdateSchema.safeParse({
      password: 'NewPass123!',
      confirmPassword: 'NewPass123!',
      currentPassword: 'OldPass123!',
    });
    expect(result.success).toBe(true);
  });

  test('allows profile update without password fields', () => {
    const result = profileUpdateSchema.safeParse({
      displayName: 'New Name',
    });
    expect(result.success).toBe(true);
  });
});
