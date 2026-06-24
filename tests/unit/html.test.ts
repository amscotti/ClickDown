import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { BoardColumns } from '../../src/components/fragments/board-columns';
import { Layout } from '../../src/components/layout';
import { TaskCard } from '../../src/components/task-card';
import {
  escapeHtml,
  externalOrigin,
  resolvePublicPath,
  safeRedirectPath,
  securityHeaders,
} from '../../src/utils/html';

describe('html utils', () => {
  test('escapeHtml escapes angle brackets and quotes', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml(`it's me & you`)).toBe('it&#39;s me &amp; you');
  });

  test('safeRedirectPath allows relative paths only', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('/teams/foo/join?token=abc')).toBe('/teams/foo/join?token=abc');
    expect(safeRedirectPath('//evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('https://evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/\\evil')).toBe('/dashboard');
    expect(safeRedirectPath(null)).toBe('/dashboard');
    expect(safeRedirectPath('relative')).toBe('/dashboard');
  });

  test('resolvePublicPath blocks path traversal', () => {
    const publicDir = join(process.cwd(), 'public');
    expect(resolvePublicPath('/css/custom.css', publicDir)).toBe(join(publicDir, 'css/custom.css'));
    expect(resolvePublicPath('/css/../../package.json', publicDir)).toBeNull();
    expect(resolvePublicPath('/js/../../../etc/passwd', publicDir)).toBeNull();
    expect(resolvePublicPath('/favicon.svg', publicDir)).toBe(join(publicDir, 'favicon.svg'));
    expect(resolvePublicPath('/secret.txt', publicDir)).toBeNull();
  });

  test('securityHeaders includes a local-only CSP', () => {
    const h = securityHeaders();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(h['Content-Security-Policy']).toContain("default-src 'self'");
    expect(h['Content-Security-Policy']).not.toContain('https:');
  });

  test('components escape user-controlled text children', async () => {
    const payload = '<img src=x onerror="alert(1)">';
    const card = await TaskCard({
      task: {
        id: 'task-id',
        title: payload,
        description: payload,
        priority: 'high',
        dueDate: null,
        assignee: null,
      },
    });
    const page = await Layout({
      title: payload,
      user: { avatarSeed: 'seed', displayName: payload },
      children: '',
    });

    expect(card).not.toContain(payload);
    expect(card).toContain('&lt;img');
    expect(page).not.toContain(`<title>${payload}`);
    expect(page).toContain('&lt;img');
  });

  test('externalOrigin defaults to the request and supports an explicit proxy origin', () => {
    const previous = process.env.APP_URL;
    try {
      delete process.env.APP_URL;
      expect(externalOrigin(new Request('http://localhost:3000/path'))).toBe(
        'http://localhost:3000'
      );
      process.env.APP_URL = 'https://tasks.example.test/base';
      expect(externalOrigin(new Request('http://internal:3000/path'))).toBe(
        'https://tasks.example.test'
      );
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  });

  test('BoardColumns renders only the board children (no nested .kanban-board)', async () => {
    const html = await BoardColumns({
      boardBase: '/teams/t/boards/b',
      columns: [{ id: 'col1', name: 'To Do', color: null, wipLimit: null }],
      tasksQuery: '?q=bug',
      canAdmin: false,
    });
    expect(html).not.toContain('kanban-board');
    expect(html).toContain('kanban-column');
    expect(html).toContain('/teams/t/boards/b/columns/col1/tasks?q=bug');
    // The partial response is swapped as innerHTML of the existing board, so it
    // must never re-render the board element itself.
    expect(html).not.toContain('x-data="kanbanBoard()"');
  });
});
