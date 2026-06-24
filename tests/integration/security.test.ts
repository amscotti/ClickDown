import { beforeAll, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { handleRequest } from '../../src/index';
import { boardService } from '../../src/services/board.service';
import { taskService } from '../../src/services/task.service';
import { teamService } from '../../src/services/team.service';
import { userService } from '../../src/services/user.service';
import { resetRateLimit } from '../../src/utils/rate-limit';

const BASE = 'http://localhost';
const PASSWORD = 'Password123!';

function req(path: string, init: RequestInit = {}): Request {
  return new Request(BASE + path, init);
}

function get(path: string, cookie?: string): Request {
  return req(path, cookie ? { headers: { Cookie: `session_id=${cookie}` } } : {});
}

function form(
  path: string,
  data: Record<string, string>,
  opts: { method?: string; cookie?: string; htmx?: boolean } = {}
): Request {
  const method = opts.method ?? 'POST';
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.Cookie = `session_id=${opts.cookie}`;
  if (opts.htmx !== false) headers['HX-Request'] = 'true';
  return req(path, { method, body: new URLSearchParams(data), headers });
}

function extractSession(res: Response): string | null {
  const sc = res.headers.get('Set-Cookie');
  if (!sc) return null;
  const m = sc.match(/session_id=([^;]+)/);
  return m ? (m[1] ?? null) : null;
}

async function exec(request: Request): Promise<Response> {
  const res = await handleRequest(request);
  if (!res) throw new Error('Expected a Response, got undefined');
  return res;
}

describe('Security regressions', () => {
  let ownerSession: string;
  let ownerId: string;
  let otherUserId: string;
  let teamId: string;
  let boardId: string;
  let columnId: string;
  let otherTeamColumnId: string;
  let taskId: string;

  beforeAll(async () => {
    resetRateLimit();
    const reg = await exec(
      form('/register', {
        email: 'sec-owner@example.com',
        password: PASSWORD,
        displayName: 'Sec Owner',
        confirmPassword: PASSWORD,
      })
    );
    ownerSession = extractSession(reg) ?? '';
    ownerId = (
      testDb.prepare('SELECT id FROM users WHERE email = ?').get('sec-owner@example.com') as {
        id: string;
      }
    ).id;

    const other = await userService.register({
      email: 'sec-outsider@example.com',
      password: PASSWORD,
      displayName: 'Outsider',
    });
    otherUserId = other.user.id;

    const team = await teamService.createTeam({ name: 'Sec Team', ownerId });
    teamId = team.id;
    const board = await boardService.createBoard({
      name: 'Sec Board',
      teamId,
    });
    boardId = board.id;
    const cols = boardService.getColumnsForBoard(boardId);
    const firstCol = cols[0];
    if (!firstCol) throw new Error('expected default columns');
    columnId = firstCol.id;

    const otherTeam = await teamService.createTeam({ name: 'Other Team', ownerId: otherUserId });
    const otherBoard = await boardService.createBoard({
      name: 'Other Board',
      teamId: otherTeam.id,
    });
    const otherCol = boardService.getColumnsForBoard(otherBoard.id)[0];
    if (!otherCol) throw new Error('expected other board columns');
    otherTeamColumnId = otherCol.id;

    const task = await taskService.createTask({
      columnId,
      title: 'Sec Task',
      createdBy: ownerId,
    });
    taskId = task.id;
  });

  test('static path traversal is rejected', async () => {
    const res = await exec(get('/css/../../package.json'));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('"name": "clickdown"');
  });

  test('responses include security headers', async () => {
    const res = await exec(get('/'));
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  test('cannot move a task to a column on another board', async () => {
    const res = await exec(
      form(`/tasks/${taskId}/move`, { columnId: otherTeamColumnId }, { cookie: ownerSession })
    );
    expect(res.status).toBe(400);
    // Task must still be on the original column
    const still = taskService.getById(taskId);
    expect(still.columnId).toBe(columnId);
  });

  test('cannot assign a non-member as assignee', async () => {
    const res = await exec(
      form(
        `/tasks/${taskId}/assignee`,
        { assigneeId: otherUserId },
        { method: 'PATCH', cookie: ownerSession }
      )
    );
    expect(res.status).toBe(400);
    const still = taskService.getById(taskId);
    expect(still.assigneeId).toBeNull();
  });

  test('reorder rejects task IDs from another board', async () => {
    const foreignTask = await taskService.createTask({
      columnId: otherTeamColumnId,
      title: 'Foreign',
      createdBy: otherUserId,
    });
    await expect(taskService.reorderTasks(columnId, [taskId, foreignTask.id])).rejects.toThrow(
      /Invalid task/
    );
  });

  test('checklist item mutations are scoped to the authorized task', async () => {
    const otherTask = await taskService.createTask({
      columnId: otherTeamColumnId,
      title: 'Other checklist task',
      createdBy: otherUserId,
    });
    const item = taskService.addChecklistItem(otherTask.id, 'Private item');

    const res = await exec(
      form(`/tasks/${taskId}/checklist/${item.id}/toggle`, {}, { cookie: ownerSession })
    );

    expect(res.status).toBe(404);
    expect(taskService.getChecklist(otherTask.id)[0]?.completed).toBe(false);
  });

  test('malicious task deep links are not embedded into scripts', async () => {
    const team = teamService.getById(teamId);
    const board = boardService.getById(boardId);
    const payload = `x');globalThis.pwned=true;//`;
    const res = await exec(
      get(
        `/teams/${team.slug}/boards/${board.slug}?task=${encodeURIComponent(payload)}`,
        ownerSession
      )
    );
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).not.toContain(payload);
    expect(body).not.toContain('data-open-task-id');
  });

  test('join without invite token fails; with token succeeds', async () => {
    const noToken = await exec(
      form('/teams/join', { teamSlug: teamService.getById(teamId).slug }, { cookie: ownerSession })
    );
    // Schema rejects missing token (400) or route rejects invalid (403)
    expect([400, 403]).toContain(noToken.status);

    const joiner = await userService.register({
      email: 'sec-joiner@example.com',
      password: PASSWORD,
      displayName: 'Joiner',
    });
    const token = teamService.getOrCreateInviteToken(teamId);
    const slug = teamService.getById(teamId).slug;
    const link = `http://localhost/teams/${slug}/join?token=${token}`;
    const ok = await exec(form('/teams/join', { teamSlug: link }, { cookie: joiner.sessionId }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('HX-Redirect')).toBe(`/teams/${slug}`);
    expect(teamService.isTeamMember(teamId, joiner.user.id)).toBe(true);
  });

  test('login honors safe redirect and rejects open redirects', async () => {
    const safe = await exec(
      form('/login', {
        email: 'sec-owner@example.com',
        password: PASSWORD,
        redirect: `/teams/${teamService.getById(teamId).slug}`,
      })
    );
    expect(safe.headers.get('HX-Redirect')).toBe(`/teams/${teamService.getById(teamId).slug}`);

    const evil = await exec(
      form('/login', {
        email: 'sec-owner@example.com',
        password: PASSWORD,
        redirect: '//evil.example',
      })
    );
    expect(evil.headers.get('HX-Redirect')).toBe('/dashboard');
  });

  test('health and ready endpoints respond', async () => {
    const health = await exec(get('/health'));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    const ready = await exec(get('/ready'));
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ status: 'ready' });
  });

  test('production-mode CSRF rejects mutating requests without Origin', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      // No Origin / Referer headers
      const res = await exec(
        req('/login', {
          method: 'POST',
          body: new URLSearchParams({ email: 'x@y.com', password: 'z' }),
          headers: { 'HX-Request': 'true' },
        })
      );
      expect(res.status).toBe(403);
      expect(await res.text()).toMatch(/Origin/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test('APP_URL allows HTTPS origin checks behind a local reverse proxy', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAppUrl = process.env.APP_URL;
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://tasks.example.test';
    try {
      const res = await exec(
        req('/login', {
          method: 'POST',
          body: new URLSearchParams({ email: 'missing@example.com', password: 'wrong' }),
          headers: { Origin: 'https://tasks.example.test', 'HX-Request': 'true' },
        })
      );
      expect(res.status).toBe(400);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previousAppUrl;
    }
  });

  test('password change requires current password and kills other sessions', async () => {
    const reg = await userService.register({
      email: 'sec-pw@example.com',
      password: PASSWORD,
      displayName: 'PW User',
    });
    const sessionA = reg.sessionId;
    const sessionB = (await userService.login('sec-pw@example.com', PASSWORD)).sessionId;

    await expect(
      userService.updateProfile(reg.user.id, {
        password: 'NewPassword99!',
      })
    ).rejects.toThrow(/Current password/);

    await userService.updateProfile(
      reg.user.id,
      {
        password: 'NewPassword99!',
        currentPassword: PASSWORD,
      },
      { currentSessionId: sessionA }
    );

    // session B is gone; session A kept
    const remaining = testDb
      .prepare('SELECT id FROM sessions WHERE user_id = ?')
      .all(reg.user.id) as Array<{ id: string }>;
    expect(remaining.map((r) => r.id)).toEqual([sessionA]);
    expect(remaining.find((r) => r.id === sessionB)).toBeUndefined();
  });
});
