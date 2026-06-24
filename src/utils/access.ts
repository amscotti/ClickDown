import type { AuthUser } from '../middleware/auth';
import type { Board, Column } from '../models/board.model';
import type { Task, TaskWithDetails } from '../models/task.model';
import type { Team } from '../models/team.model';
import { boardService } from '../services/board.service';
import { taskService } from '../services/task.service';
import { teamService } from '../services/team.service';

export type TeamAccess = { team: Team; user: AuthUser };
export type BoardAccess = TeamAccess & { board: Board };
export type TaskAccess = BoardAccess & { task: Task; column: Column };
export type TaskDetailsAccess = BoardAccess & { task: TaskWithDetails; column: Column };

function denied(status = 403, message = 'Access Denied'): Response {
  return new Response(message, { status });
}

function notFound(message: string): Response {
  return new Response(message, { status: 404 });
}

/** Resolve team by slug; require membership. */
export function accessTeamMember(teamSlug: string, user: AuthUser): TeamAccess | Response {
  try {
    const team = teamService.getBySlug(teamSlug);
    if (!teamService.isTeamMember(team.id, user.id)) return denied();
    return { team, user };
  } catch {
    return notFound('Team not found');
  }
}

/** Resolve team by slug; require admin or owner. */
export function accessTeamAdmin(teamSlug: string, user: AuthUser): TeamAccess | Response {
  try {
    const team = teamService.getBySlug(teamSlug);
    if (!teamService.isTeamAdmin(team.id, user.id)) return denied();
    return { team, user };
  } catch {
    return notFound('Team not found');
  }
}

/** Resolve team + board; require membership. */
export function accessBoardMember(
  teamSlug: string,
  boardSlug: string,
  user: AuthUser
): BoardAccess | Response {
  const base = accessTeamMember(teamSlug, user);
  if (base instanceof Response) return base;
  try {
    const board = boardService.getBySlug(base.team.id, boardSlug);
    return { ...base, board };
  } catch {
    return notFound('Board not found');
  }
}

/** Resolve team + board; require admin or owner (board/column structure mutations). */
export function accessBoardAdmin(
  teamSlug: string,
  boardSlug: string,
  user: AuthUser
): BoardAccess | Response {
  const base = accessTeamAdmin(teamSlug, user);
  if (base instanceof Response) return base;
  try {
    const board = boardService.getBySlug(base.team.id, boardSlug);
    return { ...base, board };
  } catch {
    return notFound('Board not found');
  }
}

/** Board by id; require membership. */
export function accessBoardById(boardId: string, user: AuthUser): BoardAccess | Response {
  try {
    const board = boardService.getById(boardId);
    const team = teamService.getById(board.teamId);
    if (!teamService.isTeamMember(team.id, user.id)) return denied();
    return { team, board, user };
  } catch {
    return notFound('Board not found');
  }
}

/** Board by id; require admin. */
export function accessBoardAdminById(boardId: string, user: AuthUser): BoardAccess | Response {
  try {
    const board = boardService.getById(boardId);
    const team = teamService.getById(board.teamId);
    if (!teamService.isTeamAdmin(team.id, user.id)) return denied();
    return { team, board, user };
  } catch {
    return notFound('Board not found');
  }
}

/** Task by id; require team membership on the task's board. */
export function accessTask(taskId: string, user: AuthUser): TaskAccess | Response {
  try {
    const task = taskService.getById(taskId);
    const column = boardService.getColumnById(task.columnId);
    const board = boardService.getById(column.boardId);
    const team = teamService.getById(board.teamId);
    if (!teamService.isTeamMember(team.id, user.id)) return denied();
    return { team, board, user, task, column };
  } catch {
    return notFound('Task not found');
  }
}

/** Task with details; require membership. */
export function accessTaskDetails(taskId: string, user: AuthUser): TaskDetailsAccess | Response {
  try {
    const task = taskService.getByIdWithDetails(taskId);
    if (!task.columnTeamId || !teamService.isTeamMember(task.columnTeamId, user.id)) {
      return denied();
    }
    const team = teamService.getById(task.columnTeamId);
    if (!task.columnBoardId) return notFound('Invalid task data');
    const board = boardService.getById(task.columnBoardId);
    const column = boardService.getColumnById(task.columnId);
    return { team, board, user, task, column };
  } catch {
    return notFound('Task not found');
  }
}

/** Ensure assignee is a team member (or empty). */
export function assertAssigneeOnTeam(
  teamId: string,
  assigneeId: string | null | undefined
): Response | null {
  if (!assigneeId) return null;
  if (!teamService.isTeamMember(teamId, assigneeId)) {
    return new Response('Assignee must be a team member', { status: 400 });
  }
  return null;
}
