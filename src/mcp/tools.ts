import type { AuthUser } from '../middleware/auth';
import { realtime } from '../realtime/realtime';
import { activityService } from '../services/activity.service';
import { attachmentService } from '../services/attachment.service';
import { boardService } from '../services/board.service';
import { commentService } from '../services/comment.service';
import { labelService } from '../services/label.service';
import { taskService } from '../services/task.service';
import { teamService } from '../services/team.service';
import { AppError, NotFoundError, PermissionError } from '../utils/errors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): McpToolResult {
  const message = error instanceof Error ? error.message : 'Internal error';
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === 'boolean' ? v : undefined;
}

/** Resolve a team by slug and assert the user is a member. */
function requireTeamAccess(teamSlug: string, user: AuthUser) {
  const team = teamService.getBySlug(teamSlug);
  if (!teamService.isTeamMember(team.id, user.id)) {
    throw new PermissionError(`You are not a member of team "${teamSlug}"`);
  }
  return team;
}

/** Resolve team + board by slugs and assert membership. */
function requireBoardAccess(teamSlug: string, boardSlug: string, user: AuthUser) {
  const team = requireTeamAccess(teamSlug, user);
  const board = boardService.getBySlug(team.id, boardSlug);
  return { team, board };
}

/** Resolve a task by ID and assert the user is a member of its team. */
function requireTaskAccess(taskId: string, user: AuthUser) {
  const task = taskService.getByIdWithDetails(taskId);
  if (!task.columnTeamId || !teamService.isTeamMember(task.columnTeamId, user.id)) {
    throw new PermissionError('You do not have access to this task');
  }
  return task;
}

function broadcastForTask(task: { columnBoardId?: string }, userId?: string): void {
  if (task.columnBoardId) realtime.broadcastRefresh(task.columnBoardId, userId);
}

// ─── Tool definitions (MCP schema) ───────────────────────────────────────────

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: 'list_teams',
    description:
      'List all teams the authenticated user belongs to. Returns team slugs needed by list_boards.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_boards',
    description: 'List boards in a team, including their columns and column IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        teamSlug: { type: 'string', description: 'Team slug (from list_teams)' },
      },
      required: ['teamSlug'],
    },
  },
  {
    name: 'get_board',
    description: 'Get a board with its columns (names, IDs, positions, WIP limits).',
    inputSchema: {
      type: 'object',
      properties: {
        teamSlug: { type: 'string', description: 'Team slug' },
        boardSlug: { type: 'string', description: 'Board slug' },
      },
      required: ['teamSlug', 'boardSlug'],
    },
  },
  {
    name: 'list_tasks',
    description:
      'List tasks on a board with IDs, titles, column, priority, assignee, due date, and archived state. Filter by column, assignee, or archived state.',
    inputSchema: {
      type: 'object',
      properties: {
        teamSlug: { type: 'string', description: 'Team slug' },
        boardSlug: { type: 'string', description: 'Board slug' },
        columnId: { type: 'string', description: 'Only tasks in this column ID' },
        assignedToMe: { type: 'boolean', description: 'Only tasks assigned to the token user' },
        includeArchived: { type: 'boolean', description: 'Include archived tasks' },
      },
      required: ['teamSlug', 'boardSlug'],
    },
  },
  {
    name: 'get_task',
    description:
      'Get full task details: description, column/board/team context, assignee, priority, due date, checklist (with item IDs and completion), comments, labels, and attachments.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string', description: 'Task ID' } },
      required: ['taskId'],
    },
  },
  {
    name: 'create_task',
    description:
      'Create a task on a board. Defaults to the first column if columnId is omitted. Returns the new task with its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        teamSlug: { type: 'string', description: 'Team slug' },
        boardSlug: { type: 'string', description: 'Board slug' },
        title: { type: 'string', description: 'Task title' },
        columnId: { type: 'string', description: 'Column ID (defaults to first column)' },
        description: { type: 'string', description: 'Markdown description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        dueDate: { type: 'string', description: 'ISO date, e.g. 2026-08-01' },
        assignToMe: { type: 'boolean', description: 'Assign the task to the token user' },
      },
      required: ['teamSlug', 'boardSlug', 'title'],
    },
  },
  {
    name: 'update_task',
    description:
      'Update task fields. Only provided fields are changed. Pass assigneeId="" or dueDate="" to clear them.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        title: { type: 'string' },
        description: { type: 'string', description: 'Markdown description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        assigneeId: { type: 'string', description: 'User ID, or empty string to unassign' },
        dueDate: { type: 'string', description: 'ISO date, or empty string to clear' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'move_task',
    description:
      'Move a task to another column (or position within a column). Use this to mark work as started/done.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        columnId: { type: 'string', description: 'Target column ID' },
        position: { type: 'number', description: 'Position in the column (default: end)' },
      },
      required: ['taskId', 'columnId'],
    },
  },
  {
    name: 'archive_task',
    description: 'Archive (soft-hide) or unarchive a task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        archived: { type: 'boolean', description: 'true to archive, false to restore' },
      },
      required: ['taskId', 'archived'],
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task and its comments, checklist, and attachments.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string', description: 'Task ID' } },
      required: ['taskId'],
    },
  },
  {
    name: 'add_comment',
    description:
      'Add a comment to a task. Use this to leave progress notes or context for teammates.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        body: { type: 'string', description: 'Comment text (max 2000 chars)' },
      },
      required: ['taskId', 'body'],
    },
  },
  {
    name: 'add_checklist_item',
    description: 'Add a checklist item to a task. Returns the item with its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        text: { type: 'string', description: 'Checklist item text' },
      },
      required: ['taskId', 'text'],
    },
  },
  {
    name: 'toggle_checklist_item',
    description: 'Toggle a checklist item between complete and incomplete.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        itemId: { type: 'string', description: 'Checklist item ID (from get_task)' },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'delete_checklist_item',
    description: 'Delete a checklist item from a task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        itemId: { type: 'string', description: 'Checklist item ID' },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'search_tasks',
    description:
      'Search task titles and descriptions across all boards the user can access. Returns matching tasks with board/team context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text (case-insensitive substring)' },
        teamSlug: { type: 'string', description: 'Limit search to one team' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_my_tasks',
    description:
      'Get all open (non-archived) tasks assigned to the token user, across every team and board, with column/board/team context.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
  user: AuthUser
): Promise<McpToolResult> {
  switch (name) {
    case 'list_teams': {
      const teams = teamService.getTeamsForUser(user.id);
      return ok({
        teams: teams.map((t) => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
          memberCount: t.memberCount,
        })),
      });
    }

    case 'list_boards': {
      const team = requireTeamAccess(str(args, 'teamSlug') ?? '', user);
      const boards = boardService.getBoardsForTeam(team.id);
      return ok({
        team: { slug: team.slug, name: team.name },
        boards: boards.map((b) => ({
          slug: b.slug,
          name: b.name,
          description: b.description,
          columns: boardService.getColumnsForBoard(b.id).map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position,
            wipLimit: c.wipLimit,
          })),
        })),
      });
    }

    case 'get_board': {
      const { team, board } = requireBoardAccess(
        str(args, 'teamSlug') ?? '',
        str(args, 'boardSlug') ?? '',
        user
      );
      const withColumns = boardService.getBoardWithColumns(board.id);
      return ok({
        team: { slug: team.slug, name: team.name },
        board: {
          id: withColumns.id,
          slug: withColumns.slug,
          name: withColumns.name,
          description: withColumns.description,
          columns: withColumns.columns.map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position,
            wipLimit: c.wipLimit,
            color: c.color,
          })),
        },
      });
    }

    case 'list_tasks': {
      const { team, board } = requireBoardAccess(
        str(args, 'teamSlug') ?? '',
        str(args, 'boardSlug') ?? '',
        user
      );
      const includeArchived = bool(args, 'includeArchived') ?? false;
      const columnId = str(args, 'columnId');
      const assignedToMe = bool(args, 'assignedToMe') ?? false;

      let tasks = columnId
        ? taskService.getTasksForColumn(columnId, includeArchived)
        : taskService.getTasksForBoard(board.id);
      if (!includeArchived) tasks = tasks.filter((t) => !t.archived);
      if (assignedToMe) tasks = tasks.filter((t) => t.assigneeId === user.id);
      // Scope to this board even when filtering by column (columns are board-scoped,
      // but be defensive — a columnId from another board must not leak tasks).
      tasks = tasks.filter((t) => t.columnBoardId === board.id);

      const columns = new Map(boardService.getColumnsForBoard(board.id).map((c) => [c.id, c.name]));
      return ok({
        team: { slug: team.slug, name: team.name },
        board: { slug: board.slug, name: board.name },
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          column: { id: t.columnId, name: columns.get(t.columnId) ?? null },
          position: t.position,
          priority: t.priority,
          assignee: t.assigneeId ? { id: t.assigneeId, name: t.assigneeName } : null,
          dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
          archived: !!t.archived,
          updatedAt: t.updatedAt.toISOString(),
        })),
      });
    }

    case 'get_task': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const checklist = taskService.getChecklist(task.id);
      const comments = commentService.listForTask(task.id);
      const labels = labelService.listForTask(task.id);
      const attachments = attachmentService.listForTask(task.id);
      const column = boardService.getColumnById(task.columnId);
      // getByIdWithDetails only carries board/team IDs — resolve display data.
      const board = boardService.getById(column.boardId);
      const team = teamService.getById(board.teamId);
      return ok({
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          archived: !!task.archived,
          dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
          position: task.position,
          column: { id: task.columnId, name: column.name },
          board: { id: board.id, slug: board.slug, name: board.name },
          team: { id: team.id, slug: team.slug, name: team.name },
          assignee: task.assigneeId ? { id: task.assigneeId, name: task.assigneeName } : null,
          createdBy: { id: task.createdBy, name: task.creatorName },
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          url: `/tasks/${task.id}`,
        },
        checklist: {
          total: checklist.length,
          completed: checklist.filter((i) => i.completed).length,
          items: checklist.map((i) => ({ id: i.id, text: i.text, completed: i.completed })),
        },
        labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        comments: comments.map((c) => ({
          id: c.id,
          author: { id: c.userId, name: c.userName },
          body: c.body,
          createdAt: c.createdAt.toISOString(),
        })),
        attachments: attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          sizeBytes: a.sizeBytes,
          url: `/attachments/${a.id}`,
        })),
      });
    }

    case 'create_task': {
      const { board } = requireBoardAccess(
        str(args, 'teamSlug') ?? '',
        str(args, 'boardSlug') ?? '',
        user
      );
      const title = str(args, 'title');
      if (!title) throw new NotFoundError('title is required');

      let columnId = str(args, 'columnId');
      if (!columnId) {
        const columns = boardService.getColumnsForBoard(board.id);
        const first = columns.sort((a, b) => a.position - b.position)[0];
        if (!first) throw new NotFoundError('Board has no columns');
        columnId = first.id;
      }
      const assignToMe = bool(args, 'assignToMe') ?? false;

      const task = await taskService.createTask({
        columnId,
        title,
        description: str(args, 'description'),
        priority: str(args, 'priority') as 'low' | 'medium' | 'high' | 'urgent' | undefined,
        dueDate: str(args, 'dueDate'),
        assigneeId: assignToMe ? user.id : undefined,
        createdBy: user.id,
      });
      activityService.record(task.id, 'created this task (via MCP)', user.id);
      realtime.broadcastRefresh(board.id, user.id);
      return ok({ created: true, task: { id: task.id, title: task.title, columnId } });
    }

    case 'update_task': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const updates: Record<string, unknown> = {};
      if (str(args, 'title') !== undefined) updates.title = str(args, 'title');
      if (args.description !== undefined) updates.description = args.description;
      if (str(args, 'priority') !== undefined) updates.priority = str(args, 'priority');
      if (args.assigneeId !== undefined) {
        updates.assigneeId = args.assigneeId === '' ? null : str(args, 'assigneeId');
      }
      if (args.dueDate !== undefined) {
        updates.dueDate = args.dueDate === '' ? null : str(args, 'dueDate');
      }
      if (Object.keys(updates).length === 0) {
        throw new NotFoundError('No fields to update');
      }
      const updated = await taskService.updateTask(
        task.id,
        updates as Parameters<typeof taskService.updateTask>[1]
      );
      activityService.record(task.id, 'updated this task (via MCP)', user.id);
      broadcastForTask(task, user.id);
      return ok({ updated: true, task: { id: updated.id, title: updated.title } });
    }

    case 'move_task': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const columnId = str(args, 'columnId') ?? '';
      const column = boardService.getColumnById(columnId);
      const position =
        typeof args.position === 'number'
          ? args.position
          : taskService.getTasksForColumn(columnId, true).length;
      const moved = await taskService.moveTask(task.id, { columnId, position });
      activityService.record(task.id, `moved to column "${column.name}" (via MCP)`, user.id);
      broadcastForTask(task, user.id);
      return ok({
        moved: true,
        task: { id: moved.id, columnId, position, columnName: column.name },
      });
    }

    case 'archive_task': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const archived = bool(args, 'archived') ?? true;
      if (archived) {
        taskService.archiveTask(task.id);
        activityService.record(task.id, 'archived this task (via MCP)', user.id);
      } else {
        taskService.unarchiveTask(task.id);
        activityService.record(task.id, 'unarchived this task (via MCP)', user.id);
      }
      broadcastForTask(task, user.id);
      return ok({ taskId: task.id, archived });
    }

    case 'delete_task': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      taskService.deleteTask(task.id);
      // No activity record: the task (and its activity FK target) is gone.
      broadcastForTask(task, user.id);
      return ok({ deleted: true, taskId: task.id });
    }

    case 'add_comment': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const body = str(args, 'body');
      if (!body || body.length > 2000) {
        throw new NotFoundError('Comment body required (max 2000 chars)');
      }
      const comment = commentService.add(task.id, user.id, body);
      activityService.record(task.id, 'commented (via MCP)', user.id);
      broadcastForTask(task, user.id);
      return ok({
        comment: {
          id: comment.id,
          taskId: task.id,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
        },
      });
    }

    case 'add_checklist_item': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const text = str(args, 'text');
      if (!text) throw new NotFoundError('Checklist item text required');
      const item = taskService.addChecklistItem(task.id, text);
      activityService.record(task.id, 'added checklist item (via MCP)', user.id);
      broadcastForTask(task, user.id);
      return ok({ added: true, item: { id: item.id, text: item.text, completed: false } });
    }

    case 'toggle_checklist_item': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const itemId = str(args, 'itemId') ?? '';
      taskService.toggleChecklistItem(task.id, itemId);
      activityService.record(task.id, 'toggled checklist item (via MCP)', user.id);
      broadcastForTask(task, user.id);
      const items = taskService.getChecklist(task.id);
      const item = items.find((i) => i.id === itemId);
      return ok({
        toggled: true,
        item: item ? { id: item.id, text: item.text, completed: item.completed } : null,
      });
    }

    case 'delete_checklist_item': {
      const task = requireTaskAccess(str(args, 'taskId') ?? '', user);
      const itemId = str(args, 'itemId') ?? '';
      taskService.deleteChecklistItem(task.id, itemId);
      activityService.record(task.id, 'deleted checklist item (via MCP)', user.id);
      broadcastForTask(task, user.id);
      return ok({ deleted: true, itemId });
    }

    case 'search_tasks': {
      const query = (str(args, 'query') ?? '').toLowerCase();
      if (!query) throw new NotFoundError('query is required');
      const teamFilter = str(args, 'teamSlug');

      const teams = teamService.getTeamsForUser(user.id);
      const matches: Array<Record<string, unknown>> = [];
      for (const team of teams) {
        if (teamFilter && team.slug !== teamFilter) continue;
        for (const board of boardService.getBoardsForTeam(team.id)) {
          for (const t of taskService.getTasksForBoard(board.id)) {
            if (t.archived) continue;
            const haystack = `${t.title}\n${t.description ?? ''}`.toLowerCase();
            if (!haystack.includes(query)) continue;
            matches.push({
              id: t.id,
              title: t.title,
              description: t.description,
              priority: t.priority,
              dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
              assignee: t.assigneeId ? { id: t.assigneeId, name: t.assigneeName } : null,
              board: { slug: board.slug, name: board.name },
              team: { slug: team.slug, name: team.name },
            });
          }
        }
      }
      return ok({ query, count: matches.length, tasks: matches });
    }

    case 'get_my_tasks': {
      const tasks = taskService.getTasksAssignedToUser(user.id).filter((t) => !t.archived);
      return ok({
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
          column: { id: t.columnId, name: t.columnName },
          board: { slug: t.boardSlug, name: t.boardName },
          team: { slug: t.teamSlug, name: t.teamName },
          updatedAt: t.updatedAt.toISOString(),
        })),
      });
    }

    default:
      throw new NotFoundError(`Unknown tool: ${name}`);
  }
}

/** Dispatch a tools/call request. Tool errors are returned as results (MCP
 * convention); protocol-level errors are thrown to the JSON-RPC layer. */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown> | undefined,
  user: AuthUser
): Promise<McpToolResult> {
  try {
    return await callTool(name, args ?? {}, user);
  } catch (error) {
    if (error instanceof AppError || error instanceof Error) return toolError(error);
    return toolError(new Error('Internal error'));
  }
}
