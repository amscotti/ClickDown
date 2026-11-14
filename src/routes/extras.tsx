/**
 * Comments, labels, attachments, invite regenerate, archived purge.
 */
import {
  TaskAttachmentItem,
  TaskCommentItem,
  TaskLabelsList,
} from '../components/fragments/task-extras';
import { TeamInviteSection } from '../components/fragments/team-invite';
import { db } from '../config/database';
import { realtime } from '../realtime/realtime';
import { attachmentPath, attachmentService } from '../services/attachment.service';
import { boardService } from '../services/board.service';
import { commentService } from '../services/comment.service';
import { labelService } from '../services/label.service';
import { taskService } from '../services/task.service';
import { teamService } from '../services/team.service';
import { accessBoardAdmin, accessTask, accessTeamAdmin } from '../utils/access';
import { externalOrigin } from '../utils/html';
import {
  attachmentDisposition,
  createToastTrigger,
  flashRedirect,
  parseFormData,
  requireUser,
} from '../utils/http';
import { logError } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const SAFE_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/octet-stream',
]);

/** Allowlist passive non-scriptable MIME types; coerce active or unknown types (e.g. SVG, HTML) to octet-stream. */
export function safeAttachmentContentType(mimeType: string | null | undefined): string {
  const base = (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return SAFE_ATTACHMENT_MIME_TYPES.has(base) ? base : 'application/octet-stream';
}

/** Error feedback for sub-forms inside the task modal: keep the list/form DOM intact. */
function modalError(message: string, status = 400): Response {
  return new Response(null, {
    status,
    headers: {
      'HX-Reswap': 'none',
      'HX-Trigger': createToastTrigger('error', message),
    },
  });
}

function appBaseUrl(req: Request): string {
  return externalOrigin(req);
}

export async function handleExtraRoutes(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  // Regenerate invite token (admin)
  if (url.pathname.match(/^\/teams\/[^/]+\/invite\/regenerate$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const teamSlug = url.pathname.split('/')[2] ?? '';
    const access = accessTeamAdmin(teamSlug, user);
    if (access instanceof Response) return access;
    const token = teamService.regenerateInviteToken(access.team.id);
    const inviteLink = `${appBaseUrl(req)}/teams/${access.team.slug}/join?token=${encodeURIComponent(token)}`;
    const html = await (<TeamInviteSection inviteLink={inviteLink} regenerated />);
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  // Purge one archived task
  if (url.pathname.match(/^\/tasks\/[^/]+\/purge$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const taskId = url.pathname.split('/')[2] ?? '';
    const access = accessTask(taskId, user);
    if (access instanceof Response) return access;
    if (!access.task.archived) {
      return new Response('Only archived tasks can be permanently deleted', { status: 400 });
    }
    taskService.purgeArchivedTask(access.board.id, taskId);
    realtime.broadcastHtml(access.board.id, `<div id="task-${taskId}" hx-swap-oob="delete"></div>`);
    return new Response('', {
      headers: {
        'HX-Redirect': `/teams/${access.team.slug}/boards/${access.board.slug}?archived=true`,
      },
    });
  }

  // Purge all archived on board (admin)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/archived\/purge$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const parts = url.pathname.split('/');
    const teamSlug = parts[2] ?? '';
    const boardSlug = parts[4] ?? '';
    const access = accessBoardAdmin(teamSlug, boardSlug, user);
    if (access instanceof Response) return access;
    const n = taskService.purgeAllArchived(access.board.id);
    realtime.broadcastRefresh(access.board.id, user.id);
    return flashRedirect(
      `/teams/${access.team.slug}/boards/${access.board.slug}`,
      'success',
      `Permanently deleted ${n} archived task(s)`,
      req
    );
  }

  // Add comment
  if (url.pathname.match(/^\/tasks\/[^/]+\/comments$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const taskId = url.pathname.split('/')[2] ?? '';
    const access = accessTask(taskId, user);
    if (access instanceof Response) return access;
    const data = await parseFormData(req);
    const body = (data.body || '').trim();
    if (!body || body.length > 2000) {
      return modalError('Comment required (max 2000 chars)');
    }
    const c = commentService.add(taskId, user.id, body);
    realtime.broadcastRefresh(access.board.id, user.id);
    const canModerate = teamService.isTeamAdmin(access.team.id, user.id);
    const html = await (
      <TaskCommentItem comment={c} canDelete={canModerate || c.userId === user.id} />
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html', 'HX-Trigger': 'task-updated' },
    });
  }

  // Delete comment
  if (url.pathname.match(/^\/comments\/[^/]+\/delete$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const commentId = url.pathname.split('/')[2] ?? '';
    try {
      const row = db
        .prepare(
          `SELECT c.user_id, t.column_id FROM task_comments c
           JOIN tasks t ON t.id = c.task_id WHERE c.id = ?`
        )
        .get(commentId) as { user_id: string; column_id: string } | undefined;
      if (!row) return new Response('Not found', { status: 404 });
      const col = boardService.getColumnById(row.column_id);
      const board = boardService.getById(col.boardId);
      const isAdmin = teamService.isTeamAdmin(board.teamId, user.id);
      commentService.delete(commentId, user.id, isAdmin);
      realtime.broadcastRefresh(board.id, user.id);
      return new Response('', { status: 200, headers: { 'HX-Reswap': 'delete' } });
    } catch (e) {
      logError('comments', e);
      return new Response('Failed', { status: 400 });
    }
  }

  // Create/attach label
  if (url.pathname.match(/^\/tasks\/[^/]+\/labels$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const taskId = url.pathname.split('/')[2] ?? '';
    const access = accessTask(taskId, user);
    if (access instanceof Response) return access;
    const data = await parseFormData(req);
    let labelId = data.labelId;
    const newName = (data.name || '').trim();
    if (!labelId && newName.length > 40) {
      return modalError('Label names are limited to 40 characters');
    }
    if (!labelId && newName) {
      try {
        const label = labelService.create(access.team.id, newName, data.color || '#6366f1');
        labelId = label.id;
      } catch {
        // name may already exist — look up
        const existing = labelService
          .listForTeam(access.team.id)
          .find((l) => l.name.toLowerCase() === newName.toLowerCase());
        labelId = existing?.id;
      }
    }
    if (!labelId) {
      return modalError('Label required');
    }
    labelService.addToTask(taskId, labelId);
    realtime.broadcastRefresh(access.board.id, user.id);
    const labels = labelService.listForTask(taskId);
    const html = await (<TaskLabelsList taskId={taskId} labels={labels} />);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html', 'HX-Trigger': 'task-updated' },
    });
  }

  // Remove label from task
  if (url.pathname.match(/^\/tasks\/[^/]+\/labels\/[^/]+$/) && method === 'DELETE') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const parts = url.pathname.split('/');
    const taskId = parts[2] ?? '';
    const labelId = parts[4] ?? '';
    const access = accessTask(taskId, user);
    if (access instanceof Response) return access;
    labelService.removeFromTask(taskId, labelId);
    realtime.broadcastRefresh(access.board.id, user.id);
    return new Response('', { status: 200 });
  }

  // Upload attachment
  if (url.pathname.match(/^\/tasks\/[^/]+\/attachments$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const taskId = url.pathname.split('/')[2] ?? '';
    const access = accessTask(taskId, user);
    if (access instanceof Response) return access;
    if (!checkRateLimit(`attachments:${user.id}`)) {
      return modalError('Too many uploads — please wait a minute and try again', 429);
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return modalError('File required');
    }
    if (file.size > 10 * 1024 * 1024) {
      return modalError('Max file size 10MB');
    }
    const att = await attachmentService.add(taskId, user.id, file);
    realtime.broadcastRefresh(access.board.id, user.id);
    const html = await (<TaskAttachmentItem attachment={att} />);
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  // Download attachment
  if (url.pathname.match(/^\/attachments\/[^/]+\/download$/) && method === 'GET') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const id = url.pathname.split('/')[2] ?? '';
    const att = attachmentService.getById(id);
    if (!att) return new Response('Not found', { status: 404 });
    const access = accessTask(att.taskId, user);
    if (access instanceof Response) return access;
    const file = Bun.file(attachmentPath(att.storedName));
    if (!(await file.exists())) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(file, {
      headers: {
        'Content-Type': safeAttachmentContentType(att.mimeType),
        'Content-Disposition': attachmentDisposition(att.filename),
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // Delete attachment
  if (url.pathname.match(/^\/attachments\/[^/]+$/) && method === 'DELETE') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const id = url.pathname.split('/')[2] ?? '';
    const att = attachmentService.getById(id);
    if (!att) return new Response('Not found', { status: 404 });
    const access = accessTask(att.taskId, user);
    if (access instanceof Response) return access;
    attachmentService.delete(id);
    realtime.broadcastRefresh(access.board.id, user.id);
    return new Response('', { status: 200 });
  }

  return null;
}
