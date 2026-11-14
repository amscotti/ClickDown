import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { ChecklistSection } from '../../src/components/checklist';
import { ErrorArticle, InlineError, renderInlineError } from '../../src/components/error';
import { BoardColumns } from '../../src/components/fragments/board-columns';
import {
  TaskAttachmentItem,
  TaskCommentItem,
  TaskLabelsList,
} from '../../src/components/fragments/task-extras';
import { TeamInvite, TeamInviteSection } from '../../src/components/fragments/team-invite';
import { Layout } from '../../src/components/layout';
import { Modal } from '../../src/components/modal';
import { TeamPage } from '../../src/components/pages/team';
import { TaskCard } from '../../src/components/task-card';
import { TaskDetailModal } from '../../src/components/task-detail-modal';
import { safeAttachmentContentType } from '../../src/routes/extras';
import { attachmentPath } from '../../src/services/attachment.service';
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

  test('securityHeaders includes a local-only strict script CSP', () => {
    const h = securityHeaders();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(h['Content-Security-Policy']).toContain("default-src 'self'");
    expect(h['Content-Security-Policy']).toMatch(/script-src 'self'(?:;|$)/);
    expect(h['Content-Security-Policy']).not.toContain('unsafe-eval');
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

  test('error and task-extra JSX components escape payloads without inline handlers', async () => {
    const xss = '<script>alert(1)</script>';
    const err = await InlineError({ message: xss });
    const article = await ErrorArticle({ message: xss, showBackButton: true });
    const syncErr = renderInlineError(xss);
    const comment = await TaskCommentItem({
      comment: { id: 'c1', userId: 'u1', userName: xss, body: xss, createdAt: new Date(0) },
      canDelete: true,
    });
    const labels = await TaskLabelsList({
      taskId: 't1',
      labels: [{ id: 'l1', name: xss, color: '#6366f1' }],
    });
    const att = await TaskAttachmentItem({
      attachment: { id: 'a1', filename: xss, sizeBytes: 2048 },
    });
    const invite = await TeamInviteSection({
      inviteLink: 'https://example.test/?q=" onfocus="alert(1)',
      regenerated: true,
    });

    for (const out of [err, article, syncErr, comment, labels, att]) {
      expect(out).not.toContain(xss);
      expect(out).toContain('&lt;script&gt;');
      expect(out).not.toMatch(/\bon(?:click|change|keydown|keyup)=/i);
      expect(out).not.toContain('<script');
    }
    expect(invite).not.toContain('" onfocus="');
    expect(invite).toContain('data-select-on-click');
    expect(article).toContain('data-action="history-back"');
  });

  test('safeAttachmentContentType allowlists passive MIME types and coerces active/unknown types', () => {
    expect(safeAttachmentContentType('image/png')).toBe('image/png');
    expect(safeAttachmentContentType('IMAGE/JPEG; charset=binary')).toBe('image/jpeg');
    expect(safeAttachmentContentType('text/plain; charset=utf-8')).toBe('text/plain');
    expect(safeAttachmentContentType('application/pdf')).toBe('application/pdf');

    expect(safeAttachmentContentType('image/svg+xml')).toBe('application/octet-stream');
    expect(safeAttachmentContentType('text/html')).toBe('application/octet-stream');
    expect(safeAttachmentContentType('application/xhtml+xml')).toBe('application/octet-stream');
    expect(safeAttachmentContentType('application/javascript')).toBe('application/octet-stream');
    expect(safeAttachmentContentType('text/xml')).toBe('application/octet-stream');
    expect(safeAttachmentContentType(null)).toBe('application/octet-stream');
    expect(safeAttachmentContentType('')).toBe('application/octet-stream');
  });

  test('attachmentPath rejects path traversal', () => {
    expect(() => attachmentPath('../secret.txt')).toThrow(/Invalid attachment path/);
    expect(() => attachmentPath('/etc/passwd')).toThrow(/Invalid attachment path/);
    expect(() => attachmentPath('')).toThrow(/Invalid attachment path/);
    expect(attachmentPath('valid-id.png')).toContain('valid-id.png');
  });

  test('Modal header close button includes Pico close class and accessibility attributes', async () => {
    const html = await Modal({ title: 'Edit Task', closeMode: 'flush', children: '<p>Body</p>' });
    expect(html).toContain('class="close"');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('data-modal-close="flush"');
  });

  test('TeamInvite isolates #invite-link-section swap and preserves Copy button on regenerate', async () => {
    const modal = await TeamInvite({
      team: { name: 'Alpha', slug: 'alpha' },
      inviteLink: 'http://localhost/teams/alpha/join?token=abc',
      canRegenerate: true,
    });
    expect(modal).toContain('id="invite-section"');
    expect(modal).toContain('id="invite-link-section"');
    expect(modal).toContain('hx-target="#invite-link-section"');
    expect(modal).toContain('hx-swap="outerHTML"');

    const regenerated = await TeamInviteSection({
      inviteLink: 'http://localhost/teams/alpha/join?token=xyz',
      regenerated: true,
    });
    expect(regenerated).toContain('data-copy-target="#invite-link"');
    expect(regenerated).toContain('class="inline-success"');
  });

  test('TaskDetailModal and ChecklistSection render active Write toggle, field-heading, and Created by ... on ... metadata', async () => {
    const createdAt = new Date('2026-11-13T12:00:00.000Z');
    const html = await TaskDetailModal({
      task: {
        id: 't1',
        title: 'Polish UI',
        description: '**Bold**',
        priority: 'high',
        assigneeId: null,
        assigneeName: null,
        assigneeAvatarSeed: null,
        dueDate: null,
        archived: false,
        creatorName: 'Alice Builder',
        createdAt,
      },
      members: [],
      teamSlug: 'alpha',
      boardSlug: 'sprint',
      descriptionHtml: '<p><strong>Bold</strong></p>',
      checklist: [{ id: 'c1', text: 'Check contrast', completed: false }],
      activity: [{ userName: 'Alice Builder', event: 'created', detail: null, createdAt }],
    });

    expect(html).toMatch(/class="md-toggle active"[^>]*>Write<\/button>/);
    expect(html).toMatch(/class="md-toggle"[^>]*>Preview<\/button>/);
    expect(html).not.toMatch(/class="md-toggle active"[^>]*>Preview<\/button>/);
    expect(html).toContain('<span class="field-heading">Activity</span>');
    expect(html).toContain('<span class="field-heading" style="margin-bottom:0;">Checklist</span>');
    expect(html).toContain(`Created by Alice Builder on ${createdAt.toLocaleDateString()}`);

    const checklistHtml = await ChecklistSection({
      checklist: [{ id: 'c1', text: 'Verify CSS', completed: true }],
      taskId: 't1',
    });
    expect(checklistHtml).toContain('<span class="field-heading"');
  });

  test('TaskCard renders an icon silhouette inside unassigned avatar placeholder', async () => {
    const html = await TaskCard({
      task: {
        id: 't-unassigned',
        title: 'Unassigned Work',
        description: null,
        priority: 'low',
        dueDate: null,
        assignee: null,
      },
    });
    expect(html).toContain('class="avatar-placeholder-small" aria-hidden="true"');
    expect(html).toContain('<svg');
  });

  test('TeamPage pluralizes member, board, and column counts correctly', async () => {
    const singular = await TeamPage({
      team: { slug: 'solo', name: 'Solo', description: null },
      members: [],
      boards: [{ slug: 'main', name: 'Main', description: null, columnCount: 1 }],
      memberCount: 1,
      boardCount: 1,
      isOwner: true,
      canAdmin: true,
    });
    expect(singular).toContain('1 member · 1 board');
    expect(singular).toContain('1 column</small>');

    const plural = await TeamPage({
      team: { slug: 'duo', name: 'Duo', description: null },
      members: [],
      boards: [{ slug: 'main', name: 'Main', description: null, columnCount: 4 }],
      memberCount: 2,
      boardCount: 3,
      isOwner: true,
      canAdmin: true,
    });
    expect(plural).toContain('2 members · 3 boards');
    expect(plural).toContain('4 columns</small>');
  });
});
