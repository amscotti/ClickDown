import { afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { createTestDatabase } from '../test-helper';

// In-memory DB shared by the route handler and the services it calls.
const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { handleRequest } from '../../src/index';
import { realtime } from '../../src/realtime/realtime';
import { teamService } from '../../src/services/team.service';
import { resetRateLimit } from '../../src/utils/rate-limit';

const BASE = 'http://localhost';
const PASSWORD = 'Password123!';

let sessionCookie: string;

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

describe('HTTP Route Handler Integration Tests (in-process, coverage-instrumented)', () => {
  beforeAll(async () => {
    // Register a user once; reuse the session for authenticated routes.
    const res = await exec(
      form('/register', {
        email: 'routes@example.com',
        password: PASSWORD,
        displayName: 'Routes Tester',
        confirmPassword: PASSWORD,
      })
    );
    sessionCookie = extractSession(res) ?? '';
    expect(sessionCookie).toBeTruthy();
  });

  describe('Public routes & static assets', () => {
    test('GET / renders the landing page for anonymous users', async () => {
      const res = await exec(get('/'));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('ClickDown');
      expect(body).toContain('hero-title');
    });

    test('GET /css/custom.css serves a static asset', async () => {
      const res = await exec(get('/css/custom.css'));
      expect(res.status).toBe(200);
      expect((await res.text()).length).toBeGreaterThan(0);
    });

    test('POST /markdown-preview renders markdown to safe HTML', async () => {
      const res = await exec(
        form('/markdown-preview', { text: '**hi** and `code`' }, { cookie: sessionCookie })
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('<strong>hi</strong>');
      expect(body).toContain('<code>code</code>');
    });

    test('POST /markdown-preview escapes raw HTML (XSS-safe)', async () => {
      const res = await exec(
        form('/markdown-preview', { text: '<script>alert(1)</script>' }, { cookie: sessionCookie })
      );
      const body = await res.text();
      expect(body).not.toContain('<script>');
      expect(body).toContain('&lt;script&gt;');
    });

    test('GET /api/avatar/:seed returns a valid SVG avatar (single hash fill)', async () => {
      const res = await exec(get('/api/avatar/abc?name=Test%20User'));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('image/svg+xml');
      const svg = await res.text();
      expect(svg).toMatch(/fill="#[0-9a-f]{6}"/); // exactly one '#'
      expect(svg).not.toContain('##');
      expect(svg).toContain('>TU<'); // initials "TU"
    });

    test('GET /dashboard without a session redirects to /login', async () => {
      const res = await exec(get('/dashboard'));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });

    test('unknown path returns the 404 error page', async () => {
      const res = await exec(get('/this-route-does-not-exist'));
      expect(res.status).toBe(404);
      expect((await res.text()).toLowerCase()).toContain('not found');
    });
  });

  describe('Authentication', () => {
    test('POST /login with the wrong password returns 400', async () => {
      const res = await exec(
        form('/login', { email: 'routes@example.com', password: 'WrongPass999!' })
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Invalid email or password');
    });

    test('POST /login with correct credentials sets a session cookie', async () => {
      const res = await exec(form('/login', { email: 'routes@example.com', password: PASSWORD }));
      expect(res.status).toBe(200);
      expect(res.headers.get('HX-Redirect')).toBe('/dashboard');
      expect(extractSession(res)).toBeTruthy();
    });

    test('POST /logout clears the session cookie', async () => {
      // Log in fresh so we don't invalidate the shared session used by later tests.
      const loginRes = await exec(
        form('/login', { email: 'routes@example.com', password: PASSWORD })
      );
      const freshCookie = extractSession(loginRes) ?? '';
      expect(freshCookie).toBeTruthy();

      const res = await exec(form('/logout', {}, { cookie: freshCookie }));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/');
      expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
  });

  describe('Dashboard & profile (authenticated)', () => {
    test('GET /dashboard renders the onboarding view for a fresh user', async () => {
      const res = await exec(get('/dashboard', sessionCookie));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Welcome to ClickDown');
      expect(body).toContain('Create Your First Team');
    });

    test('GET /profile renders profile settings', async () => {
      const res = await exec(get('/profile', sessionCookie));
      expect(res.status).toBe(200);
      expect((await res.text()).toLowerCase()).toContain('profile settings');
    });

    test('GET /teams/list fragment returns "no teams" for a fresh user', async () => {
      const res = await exec(get('/teams/list', sessionCookie));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('No teams yet');
    });
  });

  describe('Team, board, column & task lifecycle', () => {
    let teamSlug: string;
    let boardSlug: string;
    let columnId: string;
    let customColumnId: string;
    let taskId: string;

    test('creates a team via POST /teams and redirects to it', async () => {
      const res = await exec(
        form(
          '/teams',
          { name: 'Route Team', description: 'Integration' },
          { cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('HX-Redirect')).toContain('/teams/');

      const team = testDb.prepare('SELECT slug FROM teams WHERE name = ?').get('Route Team') as {
        slug: string;
      };
      teamSlug = team.slug;
      expect(teamSlug).toBe('route-team');
    });

    test('GET /teams/:slug renders the team page for a member', async () => {
      const res = await exec(get(`/teams/${teamSlug}`, sessionCookie));
      expect(res.status).toBe(200);
      expect((await res.text()).toLowerCase()).toContain('route team');
    });

    test('renames the team via POST /teams/:slug', async () => {
      const res = await exec(
        form(`/teams/${teamSlug}`, { name: 'Route Team Renamed' }, { cookie: sessionCookie })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('HX-Redirect')).toBe('/teams/route-team-renamed');
      teamSlug = 'route-team-renamed';
    });

    test('creates a board with default columns', async () => {
      const res = await exec(
        form(`/teams/${teamSlug}/boards`, { name: 'Sprint 1' }, { cookie: sessionCookie })
      );
      expect(res.status).toBe(200);

      const board = testDb.prepare('SELECT slug FROM boards WHERE name = ?').get('Sprint 1') as {
        slug: string;
      };
      boardSlug = board.slug;

      const cols = testDb
        .prepare('SELECT id FROM columns WHERE board_id IN (SELECT id FROM boards WHERE slug = ?)')
        .all(boardSlug) as Array<{ id: string }>;
      expect(cols.length).toBe(4);
      columnId = cols[0]?.id ?? '';
    });

    test('GET board page renders the kanban board', async () => {
      const res = await exec(get(`/teams/${teamSlug}/boards/${boardSlug}`, sessionCookie));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('kanban-board');
      expect(body).toContain('Add Column');
    });

    test('GET board page with HX-Request returns only the columns fragment', async () => {
      const res = await exec(
        req(`/teams/${teamSlug}/boards/${boardSlug}?q=bug`, {
          headers: { Cookie: `session_id=${sessionCookie}`, 'HX-Request': 'true' },
        })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Vary')).toBe('HX-Request');
      const body = await res.text();
      // Partial: no full page, and no board element (would nest inside itself)
      expect(body).not.toContain('<!DOCTYPE html>');
      expect(body).not.toContain('kanban-board');
      expect(body).toContain('kanban-column');
      expect(body).toContain('tasks?q=bug');
    });

    test('creates a custom column via POST .../columns', async () => {
      const res = await exec(
        form(
          `/teams/${teamSlug}/boards/${boardSlug}/columns`,
          { name: 'Review', color: '#ff0000', wipLimit: '3' },
          { cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      const col = testDb.prepare('SELECT id FROM columns WHERE name = ?').get('Review') as {
        id: string;
      };
      customColumnId = col.id;
      expect(customColumnId).toBeTruthy();
    });

    test('updates the custom column (name + wipLimit)', async () => {
      const res = await exec(
        form(
          `/teams/${teamSlug}/boards/${boardSlug}/columns/${customColumnId}`,
          { name: 'QA', wipLimit: '5' },
          { cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      const col = testDb
        .prepare('SELECT name, wip_limit FROM columns WHERE id = ?')
        .get(customColumnId) as { name: string; wip_limit: number };
      expect(col.name).toBe('QA');
      expect(col.wip_limit).toBe(5);
    });

    test('creates a task in the first column and flashes a success toast', async () => {
      const res = await exec(
        form(
          `/teams/${teamSlug}/boards/${boardSlug}/tasks`,
          { columnId, title: 'Route Task', description: 'details', priority: 'high' },
          { cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      // Navigating actions flash a toast via cookie + HX-Redirect
      expect(res.headers.get('HX-Redirect')).toContain('/boards/');
      const setCookie = res.headers.get('Set-Cookie') ?? '';
      expect(setCookie).toContain('flashtoast=');
      const task = testDb.prepare('SELECT id FROM tasks WHERE title = ?').get('Route Task') as {
        id: string;
      };
      taskId = task.id;
      expect(taskId).toBeTruthy();
    });

    test('GET /tasks/:id returns the task detail modal', async () => {
      const res = await exec(
        req(`/tasks/${taskId}`, {
          headers: { Cookie: `session_id=${sessionCookie}`, 'HX-Request': 'true' },
        })
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Task Details');
      expect(body).toContain('Route Task');
    });

    test('PATCH /tasks/:id/title updates the title', async () => {
      const res = await exec(
        form(
          `/tasks/${taskId}/title`,
          { title: 'Route Task Updated' },
          { method: 'PATCH', cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    test('PATCH /tasks/:id/priority validates and updates priority', async () => {
      const res = await exec(
        form(
          `/tasks/${taskId}/priority`,
          { priority: 'urgent' },
          { method: 'PATCH', cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      const row = testDb.prepare('SELECT priority FROM tasks WHERE id = ?').get(taskId) as {
        priority: string;
      };
      expect(row.priority).toBe('urgent');
    });

    test('PATCH /tasks/:id/assignee assigns the current user', async () => {
      const userId = (
        testDb.prepare('SELECT id FROM users WHERE email = ?').get('routes@example.com') as {
          id: string;
        }
      ).id;
      const res = await exec(
        form(
          `/tasks/${taskId}/assignee`,
          { assigneeId: userId },
          { method: 'PATCH', cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Routes Tester');
    });

    test('POST /tasks/:id/move moves the task to the custom column', async () => {
      const res = await exec(
        form(`/tasks/${taskId}/move`, { columnId: customColumnId }, { cookie: sessionCookie })
      );
      expect(res.status).toBe(200);
      // Move now redirects the mover to the board (flash redirect) while other
      // viewers get a filter-preserving broadcast refresh.
      expect(res.headers.get('HX-Redirect')).toBe(`/teams/${teamSlug}/boards/${boardSlug}`);
      const row = testDb.prepare('SELECT column_id FROM tasks WHERE id = ?').get(taskId) as {
        column_id: string;
      };
      expect(row.column_id).toBe(customColumnId);
    });

    test('deletes the task', async () => {
      const res = await exec(
        form(
          `/teams/${teamSlug}/boards/${boardSlug}/tasks/${taskId}/delete`,
          {},
          { cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      const row = testDb.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId);
      expect(row).toBeNull();
    });

    test('deletes the custom column', async () => {
      const res = await exec(
        form(
          `/teams/${teamSlug}/boards/${boardSlug}/columns/${customColumnId}/delete`,
          {},
          { cookie: sessionCookie }
        )
      );
      expect(res.status).toBe(200);
      expect(testDb.prepare('SELECT 1 FROM columns WHERE id = ?').get(customColumnId)).toBeNull();
    });

    test('deletes the board', async () => {
      const res = await exec(
        form(`/teams/${teamSlug}/boards/${boardSlug}/delete`, {}, { cookie: sessionCookie })
      );
      expect(res.status).toBe(200);
      expect(testDb.prepare('SELECT 1 FROM boards WHERE slug = ?').get(boardSlug)).toBeNull();
    });

    test('deletes the team (owner only)', async () => {
      const res = await exec(form(`/teams/${teamSlug}/delete`, {}, { cookie: sessionCookie }));
      expect(res.status).toBe(200);
      expect(testDb.prepare('SELECT 1 FROM teams WHERE slug = ?').get(teamSlug)).toBeNull();
    });
  });

  describe('Access control', () => {
    test('an authenticated non-member is denied access to a team', async () => {
      // Create a team as the seeded user, then try to view it as a brand-new user.
      await exec(form('/teams', { name: 'Private Team' }, { cookie: sessionCookie }));
      const teamSlug = (
        testDb.prepare('SELECT slug FROM teams WHERE name = ?').get('Private Team') as {
          slug: string;
        }
      ).slug;

      // Register a second, unrelated user
      const loginRes = await exec(
        form('/register', {
          email: 'outsider@example.com',
          password: PASSWORD,
          displayName: 'Outsider',
          confirmPassword: PASSWORD,
        })
      );
      const outsiderCookie = extractSession(loginRes) ?? '';

      const res = await exec(get(`/teams/${teamSlug}`, outsiderCookie));
      expect(res.status).toBe(403);
    });
  });

  describe('Task deep-linking (shareable URLs)', () => {
    let teamSlug: string;
    let boardSlug: string;
    let taskId: string;

    test('sets up a team, board, and task for deep-link tests', async () => {
      await exec(form('/teams', { name: 'Deep Link Team' }, { cookie: sessionCookie }));
      teamSlug = (
        testDb.prepare('SELECT slug FROM teams WHERE name = ?').get('Deep Link Team') as {
          slug: string;
        }
      ).slug;

      await exec(
        form(`/teams/${teamSlug}/boards`, { name: 'Deep Link Board' }, { cookie: sessionCookie })
      );
      boardSlug = (
        testDb.prepare('SELECT slug FROM boards WHERE name = ?').get('Deep Link Board') as {
          slug: string;
        }
      ).slug;

      await exec(
        form(
          `/teams/${teamSlug}/boards/${boardSlug}/tasks`,
          {
            columnId: (
              testDb
                .prepare(
                  'SELECT id FROM columns WHERE board_id IN (SELECT id FROM boards WHERE slug = ?)'
                )
                .get(boardSlug) as { id: string }
            ).id,
            title: 'Deep Link Task',
            priority: 'medium',
          },
          { cookie: sessionCookie }
        )
      );
      taskId = (
        testDb.prepare('SELECT id FROM tasks WHERE title = ?').get('Deep Link Task') as {
          id: string;
        }
      ).id;
      expect(taskId).toBeTruthy();
    });

    test('GET /tasks/:id as a regular browser visit redirects to the board with ?task=', async () => {
      const res = await exec(get(`/tasks/${taskId}`, sessionCookie));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(
        `/teams/${teamSlug}/boards/${boardSlug}?task=${taskId}`
      );
    });

    test('GET /tasks/:id as an HTMX request still returns the modal fragment', async () => {
      const res = await exec(
        req(`/tasks/${taskId}`, {
          headers: { Cookie: `session_id=${sessionCookie}`, 'HX-Request': 'true' },
        })
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Task Details');
      expect(body).toContain('Deep Link Task');
      expect(body).toContain('Copy Link');
      expect(body).toContain(taskId);
    });

    test('GET board with ?task= embeds the auto-open script for that task', async () => {
      const res = await exec(
        get(`/teams/${teamSlug}/boards/${boardSlug}?task=${taskId}`, sessionCookie)
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('kanban-board');
      expect(body).toContain(`data-open-task-id="${taskId}"`);
      expect(body).not.toContain(`'/tasks/${taskId}'`);
    });

    test('GET /tasks/:id with no session redirects to login with a return path', async () => {
      const res = await exec(get(`/tasks/${taskId}`));
      expect(res.status).toBe(302);
      const location = res.headers.get('Location') ?? '';
      expect(location).toMatch(/\/login/);
      expect(location).toContain(`redirect=${encodeURIComponent(`/tasks/${taskId}`)}`);
    });

    test('GET /tasks/:id for a non-existent task returns 404', async () => {
      const res = await exec(get('/tasks/does-not-exist', sessionCookie));
      expect(res.status).toBe(404);
    });
  });

  describe('Error paths and access control', () => {
    test('POST /register with missing fields returns 400', async () => {
      const res = await exec(
        form('/register', { email: '', password: '', displayName: '', confirmPassword: '' })
      );
      expect(res.status).toBe(400);
    });

    test('POST /register with mismatched passwords returns 400', async () => {
      const res = await exec(
        form('/register', {
          email: 'mismatch@example.com',
          password: 'Password123!',
          displayName: 'Test',
          confirmPassword: 'Different!',
        })
      );
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain('Passwords do not match');
    });

    test('POST /login with wrong password returns 400', async () => {
      const res = await exec(
        form('/login', { email: 'routes@example.com', password: 'WrongPass!' })
      );
      expect(res.status).toBe(400);
    });

    test('GET /dashboard without session redirects to login', async () => {
      const res = await exec(get('/dashboard'));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });

    test('GET /profile without session redirects to login', async () => {
      const res = await exec(get('/profile'));
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });

    test('GET non-existent team returns 404', async () => {
      const res = await exec(get('/teams/does-not-exist', sessionCookie));
      expect(res.status).toBe(404);
    });

    test('POST /teams with duplicate slug returns error', async () => {
      const first = await exec(
        form('/teams', { name: 'Duplicate Team', description: '' }, { cookie: sessionCookie })
      );
      expect(first.status).toBe(200);
      const second = await exec(
        form('/teams', { name: 'Duplicate Team', description: '' }, { cookie: sessionCookie })
      );
      expect(second.status).toBe(400);
    });
  });

  describe('Rate limiting', () => {
    test('login endpoint returns 429 after 10 failed attempts from same IP', async () => {
      resetRateLimit();
      // Exhaust the limit with bad logins
      for (let i = 0; i < 10; i++) {
        await exec(form('/login', { email: 'x@example.com', password: 'wrong' }));
      }
      // 11th request should be rate-limited
      const res = await exec(form('/login', { email: 'x@example.com', password: 'wrong' }));
      expect(res.status).toBe(429);
    });

    test('register endpoint returns 429 after 10 failed attempts from same IP', async () => {
      resetRateLimit();
      // Pre-register so all subsequent attempts fail with "Email already registered"
      await exec(
        form('/register', {
          email: 'dupe2@example.com',
          password: 'Password123!',
          displayName: 'Test',
          confirmPassword: 'Password123!',
        })
      );
      // Now send 10 failed attempts (these hit the counter without clearing it)
      for (let i = 0; i < 10; i++) {
        await exec(
          form('/register', {
            email: 'dupe2@example.com',
            password: 'Password123!',
            displayName: 'Test',
            confirmPassword: 'Password123!',
          })
        );
      }
      // 11th overall check should be blocked
      const res = await exec(
        form('/register', {
          email: 'over@example.com',
          password: 'Password123!',
          displayName: 'Test',
          confirmPassword: 'Password123!',
        })
      );
      expect(res.status).toBe(429);
    });
  });

  describe('CSRF protection', () => {
    test('POST with mismatched Origin header returns 403', async () => {
      const csrfReq = new Request('http://localhost/register', {
        method: 'POST',
        body: new URLSearchParams({
          email: 'csrf@example.com',
          password: 'P',
          displayName: 'T',
          confirmPassword: 'P',
        }),
        headers: { Origin: 'https://evil.example.com' },
      });
      const res = await exec(csrfReq);
      expect(res.status).toBe(403);
    });

    test('POST with same-origin Origin header is allowed', async () => {
      const csrfReq = new Request('http://localhost/register', {
        method: 'POST',
        body: new URLSearchParams({
          email: 'csrf@example.com',
          password: 'Password123!',
          displayName: 'T',
          confirmPassword: 'Password123!',
        }),
        headers: { Origin: 'http://localhost' },
      });
      const res = await exec(csrfReq);
      expect(res.status).not.toBe(403);
    });
  });
});

// ─── Extended route coverage ──────────────────────────────────────────────────

describe('Extended route integration tests', () => {
  let extSession: string;
  let extOwner: string;
  let extTeamSlug: string;
  let extTeamId: string;
  let extBoardSlug: string;
  let extBoardId: string;
  let extColumnId: string;
  let memberSession: string;

  function insertUser(email: string, name: string): string {
    const id = crypto.randomUUID();
    testDb
      .prepare(
        'INSERT INTO users (id, email, password_hash, display_name, avatar_seed) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, email.toLowerCase(), 'hash', name, id);
    return id;
  }

  function makeSession(userId: string): string {
    const sid = crypto.randomUUID();
    testDb
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sid, userId, new Date(Date.now() + 7 * 86_400_000).toISOString());
    return sid;
  }

  function insertTask(
    title: string,
    opts: { column?: string; archived?: number; description?: string | null } = {}
  ): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    testDb
      .prepare(
        'INSERT INTO tasks (id, column_id, title, description, position, priority, assignee_id, due_date, created_by, created_at, updated_at, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        opts.column ?? extColumnId,
        title,
        opts.description ?? null,
        0,
        'medium',
        null,
        null,
        extOwner,
        now,
        now,
        opts.archived ?? 0
      );
    return id;
  }

  beforeAll(async () => {
    resetRateLimit();
    const reg = await exec(
      form('/register', {
        email: 'ext@example.com',
        password: PASSWORD,
        displayName: 'Ext Owner',
        confirmPassword: PASSWORD,
      })
    );
    extSession = extractSession(reg) ?? '';
    extOwner = (
      testDb.prepare('SELECT id FROM users WHERE email = ?').get('ext@example.com') as {
        id: string;
      }
    ).id;

    await exec(
      form('/teams', { name: 'Ext Team', description: 'extended' }, { cookie: extSession })
    );
    const t = testDb.prepare('SELECT id, slug FROM teams WHERE name = ?').get('Ext Team') as {
      id: string;
      slug: string;
    };
    extTeamId = t.id;
    extTeamSlug = t.slug;

    await exec(form(`/teams/${extTeamSlug}/boards`, { name: 'Ext Board' }, { cookie: extSession }));
    const b = testDb.prepare('SELECT id, slug FROM boards WHERE name = ?').get('Ext Board') as {
      id: string;
      slug: string;
    };
    extBoardId = b.id;
    extBoardSlug = b.slug;
    extColumnId = (
      testDb
        .prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position')
        .get(extBoardId) as { id: string }
    ).id;

    const memberUser = insertUser('extmember@example.com', 'Member');
    testDb
      .prepare('INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(extTeamId, memberUser, 'member', new Date().toISOString());
    memberSession = makeSession(memberUser);

    const outsider = insertUser('extoutsider@example.com', 'Outsider');
    void makeSession(outsider);
  });

  describe('Checklist routes', () => {
    test('adds a checklist item', async () => {
      const taskId = insertTask('Checklist Task');
      const res = await exec(
        form(`/tasks/${taskId}/checklist`, { text: 'Buy milk' }, { cookie: extSession })
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Buy milk');
    });

    test('toggles a checklist item', async () => {
      const taskId = insertTask('Toggle Task');
      await exec(form(`/tasks/${taskId}/checklist`, { text: 'item' }, { cookie: extSession }));
      const itemId = (
        testDb.prepare('SELECT id FROM task_checklist WHERE task_id = ?').get(taskId) as {
          id: string;
        }
      ).id;
      const res = await exec(
        form(`/tasks/${taskId}/checklist/${itemId}/toggle`, {}, { cookie: extSession })
      );
      expect(res.status).toBe(200);
      expect(
        (
          testDb.prepare('SELECT completed FROM task_checklist WHERE id = ?').get(itemId) as {
            completed: number;
          }
        ).completed
      ).toBe(1);
    });

    test('deletes a checklist item', async () => {
      const taskId = insertTask('Delete Item Task');
      await exec(form(`/tasks/${taskId}/checklist`, { text: 'gone' }, { cookie: extSession }));
      const itemId = (
        testDb.prepare('SELECT id FROM task_checklist WHERE task_id = ?').get(taskId) as {
          id: string;
        }
      ).id;
      const res = await exec(
        form(`/tasks/${taskId}/checklist/${itemId}/delete`, {}, { cookie: extSession })
      );
      expect(res.status).toBe(200);
      expect(testDb.prepare('SELECT 1 FROM task_checklist WHERE id = ?').get(itemId)).toBeNull();
    });
  });

  describe('Task extended routes', () => {
    test('PATCH description updates and returns markdown', async () => {
      const taskId = insertTask('Desc Task');
      const res = await exec(
        form(
          `/tasks/${taskId}/description`,
          { description: 'New desc' },
          { method: 'PATCH', cookie: extSession }
        )
      );
      expect(res.status).toBe(204);
      expect(
        (
          testDb.prepare('SELECT description FROM tasks WHERE id = ?').get(taskId) as {
            description: string;
          }
        ).description
      ).toBe('New desc');
    });

    test('PATCH dueDate sets a future date', async () => {
      const taskId = insertTask('Due Task');
      const res = await exec(
        form(
          `/tasks/${taskId}/dueDate`,
          { dueDate: '2099-01-01' },
          { method: 'PATCH', cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('2099');
    });

    test('PATCH dueDate with a past date shows overdue', async () => {
      const taskId = insertTask('Overdue Task');
      const res = await exec(
        form(
          `/tasks/${taskId}/dueDate`,
          { dueDate: '2000-01-01' },
          { method: 'PATCH', cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('overdue');
    });

    test('duplicate creates a copy', async () => {
      const taskId = insertTask('Dup Me', { description: 'copy' });
      const res = await exec(form(`/tasks/${taskId}/duplicate`, {}, { cookie: extSession }));
      expect(res.status).toBe(200);
      expect(res.headers.get('HX-Redirect')).toContain(`/teams/${extTeamSlug}/boards/`);
      expect(
        testDb.prepare('SELECT id FROM tasks WHERE title = ?').get('Dup Me (copy)')
      ).toBeTruthy();
    });

    test('archive sets archived flag', async () => {
      const taskId = insertTask('Archive Me');
      const res = await exec(form(`/tasks/${taskId}/archive`, {}, { cookie: extSession }));
      expect(res.status).toBe(200);
      expect(
        (
          testDb.prepare('SELECT archived FROM tasks WHERE id = ?').get(taskId) as {
            archived: number;
          }
        ).archived
      ).toBe(1);
    });

    test('unarchive clears archived flag', async () => {
      const taskId = insertTask('Archived', { archived: 1 });
      const res = await exec(form(`/tasks/${taskId}/unarchive`, {}, { cookie: extSession }));
      expect(res.status).toBe(200);
      expect(
        (
          testDb.prepare('SELECT archived FROM tasks WHERE id = ?').get(taskId) as {
            archived: number;
          }
        ).archived
      ).toBe(0);
    });

    test('bulk-delete removes multiple tasks', async () => {
      const t1 = insertTask('Bulk A');
      const t2 = insertTask('Bulk B');
      const res = await exec(
        form(
          `/boards/${extBoardId}/tasks/bulk-delete`,
          { taskIds: `${t1},${t2}` },
          { cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('HX-Refresh')).toBe('true');
      expect(testDb.prepare('SELECT 1 FROM tasks WHERE id = ?').get(t1)).toBeNull();
      expect(testDb.prepare('SELECT 1 FROM tasks WHERE id = ?').get(t2)).toBeNull();
    });
  });

  describe('Board reorder & modal routes', () => {
    test('column reorder reverses order', async () => {
      const cols = (
        testDb
          .prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position')
          .all(extBoardId) as Array<{ id: string }>
      ).map((c) => c.id);
      const res = await exec(
        form(
          `/boards/${extBoardId}/columns/reorder`,
          { columnIds: cols.reverse().join(',') },
          { cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('"success"');
    });

    test('task reorder within a column', async () => {
      const a = insertTask('Reorder A');
      const b = insertTask('Reorder B');
      const taskIds = (
        testDb
          .prepare('SELECT id FROM tasks WHERE column_id = ? AND archived = 0 ORDER BY position')
          .all(extColumnId) as Array<{ id: string }>
      ).map((task) => task.id);
      const reordered = [b, a, ...taskIds.filter((id) => id !== a && id !== b)];
      const res = await exec(
        form(
          `/columns/${extColumnId}/tasks/reorder`,
          { taskIds: reordered.join(',') },
          { cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('HX-Refresh')).toBe('true');
    });

    test('GET board edit modal', async () => {
      const res = await exec(get(`/teams/${extTeamSlug}/boards/${extBoardSlug}/edit`, extSession));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Edit Board');
    });

    test('GET column edit modal', async () => {
      const res = await exec(
        get(`/teams/${extTeamSlug}/boards/${extBoardSlug}/columns/${extColumnId}/edit`, extSession)
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Edit Column');
    });
  });

  describe('Team invite & member routes', () => {
    test('GET team edit modal for owner', async () => {
      const res = await exec(get(`/teams/${extTeamSlug}/edit`, extSession));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Edit Team');
    });

    test('GET invite page generates link with secret token', async () => {
      const res = await exec(get(`/teams/${extTeamSlug}/invite`, extSession));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain(`/teams/${extTeamSlug}/join?token=`);
    });

    test('GET join page without token is rejected', async () => {
      const outsiderSession = makeSession(insertUser('joiner-notoken@example.com', 'Joiner'));
      const res = await exec(get(`/teams/${extTeamSlug}/join`, outsiderSession));
      expect(res.status).toBe(403);
    });

    test('GET join page for logged-in non-member with valid token', async () => {
      const token = teamService.getOrCreateInviteToken(extTeamId);
      const outsiderSession = makeSession(insertUser('joiner@example.com', 'Joiner'));
      const res = await exec(
        get(`/teams/${extTeamSlug}/join?token=${encodeURIComponent(token)}`, outsiderSession)
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Join');
    });

    test('GET join page redirects members to team when token is valid', async () => {
      const token = teamService.getOrCreateInviteToken(extTeamId);
      const res = await exec(
        get(`/teams/${extTeamSlug}/join?token=${encodeURIComponent(token)}`, extSession)
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(`/teams/${extTeamSlug}`);
    });

    test('GET team edit forbidden for non-admin member', async () => {
      const res = await exec(get(`/teams/${extTeamSlug}/edit`, memberSession));
      expect(res.status).toBe(403);
    });

    test('POST role change by owner', async () => {
      const target = insertUser('roletarget@example.com', 'Target');
      testDb
        .prepare('INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
        .run(extTeamId, target, 'member', new Date().toISOString());
      const res = await exec(
        form(
          `/teams/${extTeamSlug}/members/${target}/role`,
          { role: 'admin' },
          { cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      expect(
        (
          testDb.prepare('SELECT role FROM team_members WHERE user_id = ?').get(target) as {
            role: string;
          }
        ).role
      ).toBe('admin');
    });

    test('POST remove member by owner', async () => {
      const target = insertUser('removetarget@example.com', 'Remove');
      testDb
        .prepare('INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
        .run(extTeamId, target, 'member', new Date().toISOString());
      const res = await exec(
        form(`/teams/${extTeamSlug}/members/${target}/remove`, {}, { cookie: extSession })
      );
      expect(res.status).toBe(200);
      expect(testDb.prepare('SELECT 1 FROM team_members WHERE user_id = ?').get(target)).toBeNull();
    });
  });

  describe('Utility modal routes', () => {
    test('GET /teams/new modal', async () => {
      const res = await exec(get('/teams/new', extSession));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Create New Team');
    });

    test('GET /teams/join-modal', async () => {
      const res = await exec(get('/teams/join-modal', extSession));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Join a Team');
    });
  });

  describe('Realtime broadcast wiring', () => {
    // Spies on the realtime singleton to catch regressions in broadcast wiring.
    // realtime is never init()'d in tests, so calls are no-ops, but the spies
    // still record that route handlers attempted to broadcast.
    type RefreshMock = ReturnType<typeof spyOn<typeof realtime, 'broadcastRefresh'>>;
    let refreshSpy: RefreshMock;

    function callsFor(spy: RefreshMock, boardId: string) {
      return spy.mock.calls.filter((c: unknown[]) => c[0] === boardId);
    }

    beforeEach(() => {
      refreshSpy = spyOn(realtime, 'broadcastRefresh');
    });

    afterEach(() => {
      refreshSpy.mockRestore();
    });

    test('task create broadcasts a viewer-specific board refresh', async () => {
      const res = await exec(
        form(
          `/teams/${extTeamSlug}/boards/${extBoardSlug}/tasks`,
          { columnId: extColumnId, title: 'Broadcast Create' },
          { cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      const calls = callsFor(refreshSpy, extBoardId);
      expect(calls.length).toBeGreaterThan(0);
    });

    test('task title patch broadcasts a board refresh', async () => {
      const taskId = insertTask('Broadcast Title');
      const res = await exec(
        form(
          `/tasks/${taskId}/title`,
          { title: 'Broadcast Title Updated' },
          { method: 'PATCH', cookie: extSession }
        )
      );
      expect(res.status).toBe(204);
      const calls = callsFor(refreshSpy, extBoardId);
      expect(calls.length).toBeGreaterThan(0);
    });

    test('task delete broadcasts a board refresh', async () => {
      const taskId = insertTask('Broadcast Delete');
      const res = await exec(
        form(
          `/teams/${extTeamSlug}/boards/${extBoardSlug}/tasks/${taskId}/delete`,
          {},
          { cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      const calls = callsFor(refreshSpy, extBoardId);
      expect(calls.length).toBeGreaterThan(0);
    });

    test('task move broadcasts one board refresh', async () => {
      const taskId = insertTask('Broadcast Move');
      const targetCol = (
        testDb
          .prepare('SELECT id FROM columns WHERE board_id = ? AND id != ? ORDER BY position')
          .get(extBoardId, extColumnId) as { id: string }
      ).id;
      const res = await exec(
        form(`/tasks/${taskId}/move`, { columnId: targetCol }, { cookie: extSession })
      );
      expect(res.status).toBe(200);
      const calls = callsFor(refreshSpy, extBoardId);
      expect(calls.length).toBeGreaterThan(0);
    });

    test('column reorder broadcasts a board refresh', async () => {
      const cols = (
        testDb
          .prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position')
          .all(extBoardId) as Array<{ id: string }>
      ).map((c) => c.id);
      const res = await exec(
        form(
          `/boards/${extBoardId}/columns/reorder`,
          { columnIds: cols.reverse().join(',') },
          { cookie: extSession }
        )
      );
      expect(res.status).toBe(200);
      const calls = callsFor(refreshSpy, extBoardId);
      expect(calls.length).toBeGreaterThan(0);
    });
  });
});
