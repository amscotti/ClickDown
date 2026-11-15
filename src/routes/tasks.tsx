import { TaskNew } from '../components/fragments/task-new';
import { PriorityField } from '../components/priority-field';
import { TaskDetailModal } from '../components/task-detail-modal';
import { getSessionFromRequest } from '../middleware/auth';
import { realtime } from '../realtime/realtime';
import {
  bulkDeleteSchema,
  createTaskSchema,
  moveTaskSchema,
  patchAssigneeSchema,
  patchDescriptionSchema,
  patchDueDateSchema,
  patchPrioritySchema,
  patchTitleSchema,
} from '../schemas';
import { activityService } from '../services/activity.service';
import { attachmentService } from '../services/attachment.service';
import { boardService } from '../services/board.service';
import { commentService } from '../services/comment.service';
import { labelService } from '../services/label.service';
import { taskService } from '../services/task.service';
import { teamService } from '../services/team.service';
import { formatDateOnly, isDateOverdue, toDateOnly } from '../utils/date';
import {
  createToastTrigger,
  errorArticleResponse,
  flashRedirect,
  parseFormData,
  requireUser,
  setFlashToast,
  taskUpdatedWithToast,
} from '../utils/http';
import { logError } from '../utils/logger';
import { renderMarkdown } from '../utils/markdown';
import { checkRateLimit } from '../utils/rate-limit';
import { validateBody } from '../utils/validation';

export async function handleTaskRoutes(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  // Task creation modal (protected, HTMX fragment)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/tasks\/new$/) && method === 'GET') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];
    const columnId = url.searchParams.get('columnId');

    if (teamSlug && boardSlug && columnId) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);

        // Check if user is a member
        if (!teamService.isTeamMember(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Verify column belongs to this board
        const column = boardService.getColumnById(columnId);
        if (column.boardId !== board.id) {
          return new Response('Column not found', { status: 404 });
        }

        // Get team members for assignee dropdown
        const members = teamService.getTeamMembers(team.id);

        // Set minimum date for due date to today
        const minDate = new Date().toISOString().split('T')[0] ?? '';

        const html = await (
          <TaskNew
            teamSlug={teamSlug}
            boardSlug={boardSlug}
            columnId={columnId}
            members={members}
            minDate={minDate}
          />
        );
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return new Response('Board not found', { status: 404 });
      }
    }
  }

  // Create task (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/tasks$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const rateLimitKey = `task-create:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];

    if (teamSlug && boardSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);

        // Check if user is a member
        if (!teamService.isTeamMember(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, createTaskSchema);
        if (input instanceof Response) return input;

        // Verify column belongs to this board
        const column = boardService.getColumnById(input.columnId);
        if (column.boardId !== board.id) {
          return await errorArticleResponse('Invalid column');
        }

        // Assignee (if any) must be a member of this team
        if (input.assigneeId && !teamService.isTeamMember(team.id, input.assigneeId)) {
          return await errorArticleResponse('Assignee must be a team member');
        }

        // Create task
        const createdTask = await taskService.createTask({
          ...input,
          createdBy: user.id,
        });
        activityService.record(createdTask.id, 'created', user.id);

        realtime.broadcastRefresh(board.id, user.id);

        // Return success that reloads the page
        return flashRedirect(
          `/teams/${team.slug}/boards/${board.slug}`,
          'success',
          'Task created',
          req
        );
      } catch (error) {
        logError('tasks', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create task';
        return errorArticleResponse(errorMessage, { showBackButton: true });
      }
    }
  }

  // Task detail modal (protected, HTMX fragment)
  if (url.pathname.match(/^\/tasks\/[^/]+$/) && method === 'GET') {
    const user = getSessionFromRequest(req);

    if (!user) {
      const isHtmx = req.headers.get('HX-Request') === 'true';
      // A shared task link opened by a logged-out visitor should send them to
      // login and bring them back to the task afterwards.
      if (!isHtmx) {
        return new Response('', {
          status: 302,
          headers: { Location: `/login?redirect=${encodeURIComponent(url.pathname)}` },
        });
      }
      return new Response('Unauthorized', { status: 401 });
    }

    const pathParts = url.pathname.split('/');
    const taskId = pathParts[2];

    if (taskId) {
      try {
        const task = taskService.getByIdWithDetails(taskId);

        // Verify user has access to this board
        if (!task.columnTeamId || !teamService.isTeamMember(task.columnTeamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Get team and board info from task
        const team = teamService.getById(task.columnTeamId);
        if (!task.columnBoardId) {
          return new Response('Invalid task data', { status: 400 });
        }
        const board = boardService.getById(task.columnBoardId);

        // Deep-link: a direct browser visit (not an HTMX fragment request)
        // redirects to the board with this task auto-opened, giving a stable,
        // shareable URL per task.
        const isHtmxRequest = req.headers.get('HX-Request') === 'true';
        if (!isHtmxRequest) {
          return new Response('', {
            status: 302,
            headers: { Location: `/teams/${team.slug}/boards/${board.slug}?task=${taskId}` },
          });
        }

        // Get team members for assignee dropdown
        const members = teamService.getTeamMembers(team.id);

        const html = await (
          <TaskDetailModal
            task={{
              id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              assigneeId: task.assigneeId,
              assigneeName: task.assigneeName ?? null,
              assigneeAvatarSeed: task.assigneeAvatarSeed ?? null,
              dueDate: task.dueDate,
              archived: task.archived ?? false,
              creatorName: task.creatorName ?? '',
              createdAt: task.createdAt,
            }}
            members={members}
            teamSlug={team.slug}
            boardSlug={board.slug}
            descriptionHtml={renderMarkdown(task.description)}
            checklist={taskService.getChecklist(taskId)}
            activity={activityService
              .getForTask(taskId)
              .map((a) => ({ ...a, userName: a.userName ?? 'Someone' }))}
            comments={commentService.listForTask(taskId)}
            labels={labelService.listForTask(taskId)}
            teamLabels={labelService.listForTeam(team.id)}
            attachments={attachmentService.listForTask(taskId)}
            currentUserId={user.id}
            canModerate={teamService.isTeamAdmin(team.id, user.id)}
          />
        );
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return new Response('Task not found', { status: 404 });
      }
    }
  }

  // Move task (protected, POST)
  if (url.pathname.match(/^\/tasks\/[^/]+\/move$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const rateLimitKey = `task-move:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }

    const pathParts = url.pathname.split('/');
    const taskId = pathParts[2];

    if (taskId) {
      try {
        const task = taskService.getById(taskId);

        // Verify user has access to this board
        const column = boardService.getColumnById(task.columnId);
        const board = boardService.getById(column.boardId);
        if (!teamService.isTeamMember(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, moveTaskSchema);
        if (input instanceof Response) return input;
        const { columnId } = input;

        // Target column must exist and belong to the same board
        const targetColumn = boardService.getColumnById(columnId);
        if (targetColumn.boardId !== board.id) {
          return new Response('Target column is not on this board', { status: 400 });
        }

        // Get tasks count in target column for position. Include archived tasks
        // so the appended position stays above any archived task positions.
        const tasks = taskService.getTasksForColumn(columnId, true);
        const position = tasks.length;

        // Move task
        await taskService.moveTask(taskId, { columnId, position });
        activityService.record(taskId, 'moved', user.id, columnId);

        const team = teamService.getById(board.teamId);
        realtime.broadcastRefresh(board.id, user.id);

        return flashRedirect(
          `/teams/${team.slug}/boards/${board.slug}`,
          'success',
          'Task moved',
          req
        );
      } catch (error) {
        logError('tasks', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to move task';
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  // Update task title (protected, PATCH)
  if (url.pathname.match(/^\/tasks\/[^/]+\/title$/) && method === 'PATCH') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const taskId = pathParts[2];

    if (taskId) {
      try {
        const task = taskService.getById(taskId);

        // Verify user has access
        const column = boardService.getColumnById(task.columnId);
        const board = boardService.getById(column.boardId);
        if (!teamService.isTeamMember(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, patchTitleSchema, { toast: true });
        if (input instanceof Response) return input;

        await taskService.updateTask(taskId, { title: input.title });
        activityService.record(taskId, 'renamed', user.id, input.title);

        realtime.broadcastRefresh(board.id, user.id);

        return new Response(null, {
          status: 204,
          headers: {
            'HX-Trigger': taskUpdatedWithToast('success', 'Title updated'),
          },
        });
      } catch {
        return new Response('Task not found', { status: 404 });
      }
    }
  }

  // Update task description (protected, PATCH)
  if (url.pathname.match(/^\/tasks\/[^/]+\/description$/) && method === 'PATCH') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const taskId = pathParts[2];

    if (taskId) {
      try {
        const task = taskService.getById(taskId);

        // Verify user has access
        const column = boardService.getColumnById(task.columnId);
        const board = boardService.getById(column.boardId);
        if (!teamService.isTeamMember(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, patchDescriptionSchema, { toast: true });
        if (input instanceof Response) return input;

        await taskService.updateTask(taskId, {
          description: input.description,
        });
        activityService.record(taskId, 'updated the description', user.id);

        realtime.broadcastRefresh(board.id, user.id);

        return new Response(null, {
          status: 204,
          headers: {
            'HX-Trigger': taskUpdatedWithToast('success', 'Description updated'),
          },
        });
      } catch {
        return new Response('Task not found', { status: 404 });
      }
    }
  }

  // Update task priority (protected, PATCH)
  if (url.pathname.match(/^\/tasks\/[^/]+\/priority$/) && method === 'PATCH') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const taskId = pathParts[2];

    if (taskId) {
      try {
        const task = taskService.getById(taskId);

        // Verify user has access
        const column = boardService.getColumnById(task.columnId);
        const board = boardService.getById(column.boardId);
        if (!teamService.isTeamMember(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, patchPrioritySchema, { toast: true });
        if (input instanceof Response) return input;

        await taskService.updateTask(taskId, {
          priority: input.priority,
        });
        activityService.record(taskId, 'set the priority', user.id, input.priority);

        // Broadcast updated card to other board viewers
        const priorityUpdated = taskService.getByIdWithDetails(taskId);
        realtime.broadcastRefresh(board.id, user.id);

        const html = await (<PriorityField priority={priorityUpdated.priority} taskId={taskId} />);
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html',
            'HX-Trigger': taskUpdatedWithToast('success', 'Priority updated'),
          },
        });
      } catch {
        return new Response('Task not found', { status: 404 });
      }
    }
  }

  // Update task assignee (protected, PATCH)
  if (url.pathname.match(/^\/tasks\/[^/]+\/assignee$/) && method === 'PATCH') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const taskId = pathParts[2];

    if (taskId) {
      try {
        const task = taskService.getById(taskId);

        // Verify user has access
        const column = boardService.getColumnById(task.columnId);
        const board = boardService.getById(column.boardId);
        if (!teamService.isTeamMember(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, patchAssigneeSchema, { toast: true });
        if (input instanceof Response) return input;

        // Assignee (if any) must be a member of this team
        if (input.assigneeId && !teamService.isTeamMember(board.teamId, input.assigneeId)) {
          return new Response(null, {
            status: 400,
            headers: {
              'HX-Reswap': 'none',
              'HX-Trigger': createToastTrigger('error', 'Assignee must be a team member'),
            },
          });
        }

        await taskService.updateTask(taskId, {
          assigneeId: input.assigneeId,
        });

        // Get updated task with details
        const updatedTask = taskService.getByIdWithDetails(taskId);
        activityService.record(
          taskId,
          updatedTask.assigneeName ? 'assigned the task' : 'unassigned the task',
          user.id,
          updatedTask.assigneeName ?? undefined
        );

        realtime.broadcastRefresh(board.id, user.id);

        const assigneeHtml = await (
          <div id="taskAssigneeDisplay" class="assignee-display">
            {updatedTask.assigneeName ? (
              <>
                <img
                  src={`/api/avatar/${updatedTask.assigneeAvatarSeed || updatedTask.assigneeId}?name=${encodeURIComponent(updatedTask.assigneeName)}`}
                  alt={updatedTask.assigneeName}
                  class="avatar-small"
                />
                <span safe>{updatedTask.assigneeName}</span>
              </>
            ) : (
              <span class="unassigned">Unassigned</span>
            )}
          </div>
        );

        return new Response(assigneeHtml, {
          headers: {
            'Content-Type': 'text/html',
            'HX-Trigger': taskUpdatedWithToast('success', 'Assignee updated'),
          },
        });
      } catch {
        return new Response('Task not found', { status: 404 });
      }
    }
  }

  // Update task due date (protected, PATCH)
  if (url.pathname.match(/^\/tasks\/[^/]+\/dueDate$/) && method === 'PATCH') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const taskId = pathParts[2];

    if (taskId) {
      try {
        const task = taskService.getById(taskId);

        // Verify user has access
        const column = boardService.getColumnById(task.columnId);
        const board = boardService.getById(column.boardId);
        if (!teamService.isTeamMember(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, patchDueDateSchema, { toast: true });
        if (input instanceof Response) return input;

        await taskService.updateTask(taskId, {
          dueDate: input.dueDate,
        });
        const dueUpdated = taskService.getByIdWithDetails(taskId);

        realtime.broadcastRefresh(board.id, user.id);

        const overdue = isDateOverdue(dueUpdated.dueDate);
        const dueDateHtml = await (
          <div id="taskDueDateDisplay" class={`due-date-display ${overdue ? 'overdue' : ''}`}>
            {dueUpdated.dueDate ? (
              <>
                {overdue ? <span class="overdue-badge">Overdue:</span> : null}
                <time safe datetime={toDateOnly(dueUpdated.dueDate)}>
                  {formatDateOnly(dueUpdated.dueDate, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
              </>
            ) : (
              <span class="no-date">No due date</span>
            )}
          </div>
        );

        return new Response(dueDateHtml, {
          headers: {
            'Content-Type': 'text/html',
            'HX-Trigger': taskUpdatedWithToast('success', 'Due date updated'),
          },
        });
      } catch {
        return new Response('Task not found', { status: 404 });
      }
    }
  }

  // Duplicate task (protected, POST /tasks/:id/duplicate)
  if (url.pathname.match(/^\/tasks\/[^/]+\/duplicate$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const rateLimitKey = `task-duplicate:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }
    const taskId = url.pathname.split('/')[2] ?? '';
    try {
      const task = taskService.getByIdWithDetails(taskId);
      if (!task.columnTeamId || !teamService.isTeamMember(task.columnTeamId, user.id)) {
        return new Response('Access Denied', { status: 403 });
      }
      const createdTask = await taskService.createTask({
        columnId: task.columnId,
        title: `${task.title} (copy)`,
        description: task.description ?? undefined,
        priority: task.priority,
        assigneeId: task.assigneeId ?? undefined,
        dueDate: task.dueDate ?? undefined,
        createdBy: user.id,
      });
      activityService.record(taskId, 'duplicated', user.id);
      activityService.record(createdTask.id, 'created', user.id);

      const board = boardService.getById(task.columnBoardId ?? '');
      const team = teamService.getById(task.columnTeamId);
      realtime.broadcastRefresh(board.id, user.id);
      return flashRedirect(
        `/teams/${team.slug}/boards/${board.slug}`,
        'success',
        'Task duplicated',
        req
      );
    } catch (error) {
      logError('tasks', error);
      const msg = error instanceof Error ? error.message : 'Failed to duplicate task';
      return new Response(msg, { status: 400 });
    }
  }

  // Bulk delete tasks (protected, POST /boards/:boardId/tasks/bulk-delete)
  if (url.pathname.match(/^\/boards\/[^/]+\/tasks\/bulk-delete$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const rateLimitKey = `tasks-bulk-delete:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }
    const boardId = url.pathname.split('/')[2] ?? '';
    try {
      const board = boardService.getById(boardId);
      if (!teamService.isTeamMember(board.teamId, user.id)) {
        return new Response('Access Denied', { status: 403 });
      }
      const data = await parseFormData(req);
      const input = validateBody(data, bulkDeleteSchema);
      if (input instanceof Response) return input;
      const taskIds = input.taskIds;
      const deleted = taskService.bulkDelete(board.id, taskIds);

      realtime.broadcastRefresh(board.id, user.id);

      return new Response('', {
        headers: {
          'HX-Refresh': 'true',
          'Set-Cookie': setFlashToast('success', `${deleted} task(s) deleted`),
        },
      });
    } catch (error) {
      logError('tasks', error);
      const msg = error instanceof Error ? error.message : 'Bulk delete failed';
      return new Response(msg, { status: 400 });
    }
  }

  // Archive / unarchive task (protected, POST /tasks/:id/archive|unarchive)
  if (url.pathname.match(/^\/tasks\/[^/]+\/(un)?archive$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const rateLimitKey = `task-archive:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }
    const taskId = url.pathname.split('/')[2] ?? '';
    const unarchive = url.pathname.endsWith('/unarchive');
    try {
      const task = taskService.getByIdWithDetails(taskId);
      if (!task.columnTeamId || !teamService.isTeamMember(task.columnTeamId, user.id)) {
        return new Response('Access Denied', { status: 403 });
      }
      if (unarchive) taskService.unarchiveTask(taskId);
      else taskService.archiveTask(taskId);
      activityService.record(
        taskId,
        unarchive ? 'unarchived the task' : 'archived the task',
        user.id
      );

      const board = boardService.getById(task.columnBoardId ?? '');
      const team = teamService.getById(task.columnTeamId);
      realtime.broadcastRefresh(board.id, user.id);
      return flashRedirect(
        `/teams/${team.slug}/boards/${board.slug}`,
        'success',
        unarchive ? 'Task unarchived' : 'Task archived',
        req
      );
    } catch (error) {
      logError('tasks', error);
      const msg = error instanceof Error ? error.message : 'Failed to update task';
      return new Response(msg, { status: 400 });
    }
  }

  // Delete task (protected, POST)
  if (
    url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/tasks\/[^/]+\/delete$/) &&
    method === 'POST'
  ) {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];
    const taskId = pathParts[6];

    if (teamSlug && boardSlug && taskId) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);
        const task = taskService.getById(taskId);

        // Verify task belongs to this board
        const taskColumn = boardService.getColumnById(task.columnId);
        if (taskColumn.boardId !== board.id) {
          return new Response('Task not found', { status: 404 });
        }

        // Check if user is a member
        if (!teamService.isTeamMember(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Delete task
        taskService.deleteTask(taskId);

        // Broadcast deletion to other board viewers
        realtime.broadcastRefresh(board.id, user.id);

        // Refresh the board (HTMX native redirect — closes the modal on navigation)
        return flashRedirect(
          `/teams/${team.slug}/boards/${board.slug}`,
          'success',
          'Task deleted',
          req
        );
      } catch (error) {
        logError('tasks', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete task';
        return errorArticleResponse(errorMessage, { showBackButton: true });
      }
    }
  }

  return null;
}
