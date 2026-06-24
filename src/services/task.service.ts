import { nanoid } from 'nanoid';
import { db } from '../config/database';
import type {
  CreateTaskInput,
  MoveTaskInput,
  Task,
  TaskWithDetails,
  UpdateTaskInput,
} from '../models/task.model';
import { TASK_PRIORITIES, TaskPriority } from '../models/task.model';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';

interface DbTask {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived?: number;
}

/** Row shape returned by the shared task-with-details query. */
interface TaskDetailsRow {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived?: number;
  column_board_id: string;
  column_team_id: string;
  assignee_name: string | null;
  assignee_avatar_seed: string | null;
  creator_name: string;
  creator_avatar_seed: string;
}

/** Row shape for assigned-task queries (adds board/team display fields). */
interface AssignedTaskDetailsRow extends TaskDetailsRow {
  column_name: string;
  board_name: string;
  board_slug: string;
  team_name: string;
  team_slug: string;
}

/** Shared SELECT list for task-with-details queries. */
const TASK_DETAILS_COLUMNS = `
  t.*,
  c.board_id as column_board_id,
  b.team_id as column_team_id,
  assignee.display_name as assignee_name,
  assignee.avatar_seed as assignee_avatar_seed,
  creator.display_name as creator_name,
  creator.avatar_seed as creator_avatar_seed
`;

/** Shared FROM/JOIN clause for task-with-details queries. */
const TASK_DETAILS_JOINS = `
  FROM tasks t
  JOIN columns c ON c.id = t.column_id
  JOIN boards b ON b.id = c.board_id
  LEFT JOIN users assignee ON assignee.id = t.assignee_id
  JOIN users creator ON creator.id = t.created_by
`;

function mapTaskDetailsRow(t: TaskDetailsRow): TaskWithDetails {
  return {
    id: t.id,
    columnId: t.column_id,
    title: t.title,
    description: t.description,
    position: t.position,
    priority: t.priority as TaskPriority,
    assigneeId: t.assignee_id,
    dueDate: t.due_date ? new Date(t.due_date) : null,
    createdBy: t.created_by,
    createdAt: new Date(t.created_at),
    updatedAt: new Date(t.updated_at),
    columnBoardId: t.column_board_id,
    columnTeamId: t.column_team_id,
    assigneeName: t.assignee_name,
    assigneeAvatarSeed: t.assignee_avatar_seed,
    creatorName: t.creator_name,
    creatorAvatarSeed: t.creator_avatar_seed,
  };
}

export class TaskService {
  // Get task by ID with basic info
  getById(taskId: string): Task {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as DbTask | undefined;

    if (!task) {
      throw new NotFoundError('Task');
    }

    return {
      id: task.id,
      columnId: task.column_id,
      title: task.title,
      description: task.description,
      position: task.position,
      priority: task.priority,
      assigneeId: task.assignee_id,
      dueDate: task.due_date ? new Date(task.due_date) : null,
      createdBy: task.created_by,
      createdAt: new Date(task.created_at),
      updatedAt: new Date(task.updated_at),
      archived: !!task.archived,
    };
  }

  // Get task with details (joined data)
  getByIdWithDetails(taskId: string): TaskWithDetails {
    const task = db
      .prepare(`SELECT ${TASK_DETAILS_COLUMNS} ${TASK_DETAILS_JOINS} WHERE t.id = ?`)
      .get(taskId) as TaskDetailsRow | undefined;

    if (!task) {
      throw new NotFoundError('Task');
    }

    return { ...mapTaskDetailsRow(task), archived: !!task.archived };
  }

  // Get all tasks for a column. Archived tasks are excluded by default so that
  // broadcasts and non-archived views never leak archived cards; pass
  // `includeArchived: true` for paths that need the full set (e.g. position calc).
  getTasksForColumn(columnId: string, includeArchived = false): TaskWithDetails[] {
    const archiveFilter = includeArchived ? '' : 'AND t.archived = 0';
    const tasks = db
      .prepare(
        `SELECT ${TASK_DETAILS_COLUMNS} ${TASK_DETAILS_JOINS}
        WHERE t.column_id = ?
        ${archiveFilter}
        ORDER BY t.position
      `
      )
      .all(columnId) as TaskDetailsRow[];

    return tasks.map(mapTaskDetailsRow);
  }

  // Get all tasks for a board (across all columns)
  getTasksForBoard(boardId: string): TaskWithDetails[] {
    const tasks = db
      .prepare(
        `SELECT ${TASK_DETAILS_COLUMNS} ${TASK_DETAILS_JOINS}
        WHERE c.board_id = ?
        ORDER BY c.position, t.position
      `
      )
      .all(boardId) as TaskDetailsRow[];

    return tasks.map(mapTaskDetailsRow);
  }

  // Create a new task (position assignment is transactional to avoid races)
  async createTask(input: CreateTaskInput): Promise<Task> {
    const { columnId, title, description, position, priority, assigneeId, dueDate, createdBy } =
      input;

    const taskId = nanoid();
    const now = new Date().toISOString();

    const insert = db.transaction(() => {
      const finalPosition =
        position ??
        (
          db
            .prepare(
              'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE column_id = ?'
            )
            .get(columnId) as { next_pos: number }
        ).next_pos;

      db.prepare(
        'INSERT INTO tasks (id, column_id, title, description, position, priority, assignee_id, due_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        taskId,
        columnId,
        title,
        description ?? null,
        finalPosition,
        priority ?? TaskPriority.Medium,
        assigneeId ?? null,
        dueDate ? new Date(dueDate).toISOString() : null,
        createdBy,
        now,
        now
      );
    });
    insert();

    return this.getById(taskId);
  }

  // Update a task
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (input.title !== undefined) {
      updates.push('title = ?');
      values.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description ?? null);
    }
    if (input.columnId !== undefined) {
      updates.push('column_id = ?');
      values.push(input.columnId);
    }
    if (input.position !== undefined) {
      updates.push('position = ?');
      values.push(input.position);
    }
    if (input.priority !== undefined) {
      if (!TASK_PRIORITIES.includes(input.priority)) {
        throw new ValidationError('Invalid priority value');
      }
      updates.push('priority = ?');
      values.push(input.priority);
    }
    if (input.assigneeId !== undefined) {
      updates.push('assignee_id = ?');
      values.push(input.assigneeId ?? null);
    }
    if (input.dueDate !== undefined) {
      updates.push('due_date = ?');
      values.push(input.dueDate ? new Date(input.dueDate).toISOString() : null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(taskId);

      const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...(values as [string, ...Array<string | number | null>]));
    }

    return this.getById(taskId);
  }

  // Move a task to a different column/position (transactional)
  async moveTask(taskId: string, input: MoveTaskInput): Promise<Task> {
    const { columnId, position } = input;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare('UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?').run(
        columnId,
        position,
        now,
        taskId
      );
    })();

    return this.getById(taskId);
  }

  // Delete a task
  deleteTask(taskId: string): void {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  // Bulk-delete tasks that belong to a specific board (single query, scoped).
  bulkDelete(boardId: string, taskIds: string[]): number {
    if (taskIds.length === 0) return 0;
    const placeholders = taskIds.map(() => '?').join(',');
    const result = db
      .prepare(
        `DELETE FROM tasks WHERE id IN (${placeholders})
         AND column_id IN (SELECT id FROM columns WHERE board_id = ?)`
      )
      .run(...taskIds, boardId);
    return result.changes;
  }

  // Archive / unarchive (soft-hide) a task
  archiveTask(taskId: string): void {
    db.prepare('UPDATE tasks SET archived = 1, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      taskId
    );
  }
  unarchiveTask(taskId: string): void {
    db.prepare('UPDATE tasks SET archived = 0, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      taskId
    );
  }

  /** Permanently delete a single archived task (scoped to board). */
  purgeArchivedTask(boardId: string, taskId: string): number {
    const result = db
      .prepare(
        `DELETE FROM tasks WHERE id = ? AND archived = 1
         AND column_id IN (SELECT id FROM columns WHERE board_id = ?)`
      )
      .run(taskId, boardId);
    return result.changes;
  }

  /** Permanently delete all archived tasks on a board. */
  purgeAllArchived(boardId: string): number {
    const result = db
      .prepare(
        `DELETE FROM tasks WHERE archived = 1
         AND column_id IN (SELECT id FROM columns WHERE board_id = ?)`
      )
      .run(boardId);
    return result.changes;
  }

  countArchivedOnBoard(boardId: string): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM tasks t
         JOIN columns c ON c.id = t.column_id
         WHERE c.board_id = ? AND t.archived = 1`
      )
      .get(boardId) as { c: number };
    return row.c;
  }

  // Reorder tasks within a column (transactional).
  // Only updates tasks that already belong to the target column OR the same board,
  // so foreign task IDs cannot be smuggled into another team's board.
  async reorderTasks(columnId: string, taskIds: string[]): Promise<void> {
    const column = db.prepare('SELECT board_id FROM columns WHERE id = ?').get(columnId) as
      | { board_id: string }
      | undefined;
    if (!column) {
      throw new NotFoundError('Column');
    }

    const boardId = column.board_id;
    if (taskIds.length === 0 || new Set(taskIds).size !== taskIds.length) {
      throw new ValidationError('Task order contains missing or duplicate IDs');
    }

    const taskRows = db
      .prepare(
        `SELECT t.id, t.column_id FROM tasks t
       JOIN columns c ON c.id = t.column_id
       WHERE c.board_id = ? AND t.archived = 0`
      )
      .all(boardId) as Array<{ id: string; column_id: string }>;
    const byId = new Map(taskRows.map((task) => [task.id, task]));
    const currentTargetIds = taskRows
      .filter((task) => task.column_id === columnId)
      .map((task) => task.id);
    if (currentTargetIds.some((id) => !taskIds.includes(id))) {
      throw new ConflictError('Task order is incomplete; refresh the board and try again');
    }
    const incoming = taskIds.filter((id) => byId.get(id)?.column_id !== columnId);
    if (incoming.length > 1 || taskIds.some((id) => !byId.has(id))) {
      throw new ValidationError('Invalid task order for this board');
    }

    const sourceColumnId = incoming[0] ? byId.get(incoming[0])?.column_id : undefined;
    const stmt = db.prepare(
      'UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?'
    );
    const now = new Date().toISOString();

    db.transaction(() => {
      for (let i = 0; i < taskIds.length; i++) {
        const tid = taskIds[i];
        if (!tid) continue;
        stmt.run(columnId, i, now, tid);
      }
      if (sourceColumnId && sourceColumnId !== columnId) {
        const remaining = db
          .prepare(
            'SELECT id FROM tasks WHERE column_id = ? AND archived = 0 ORDER BY position, created_at'
          )
          .all(sourceColumnId) as Array<{ id: string }>;
        const sourceStmt = db.prepare(
          'UPDATE tasks SET position = ?, updated_at = ? WHERE id = ? AND column_id = ?'
        );
        remaining.forEach((task, index) => {
          sourceStmt.run(index, now, task.id, sourceColumnId);
        });
      }
    })();
  }

  // Assign task to user
  async assignTask(taskId: string, assigneeId: string | null): Promise<Task> {
    const now = new Date().toISOString();

    db.prepare('UPDATE tasks SET assignee_id = ?, updated_at = ? WHERE id = ?').run(
      assigneeId,
      now,
      taskId
    );

    return this.getById(taskId);
  }

  // Get tasks assigned to a user
  getTasksAssignedToUser(userId: string): TaskWithDetails[] {
    const tasks = db
      .prepare(
        `SELECT ${TASK_DETAILS_COLUMNS},
          c.name as column_name,
          b.name as board_name,
          b.slug as board_slug,
          team.name as team_name,
          team.slug as team_slug
        ${TASK_DETAILS_JOINS}
        JOIN teams team ON team.id = b.team_id
        JOIN team_members tm ON tm.team_id = b.team_id AND tm.user_id = ?
        WHERE t.assignee_id = ? AND t.archived = 0
        ORDER BY t.created_at DESC
      `
      )
      .all(userId, userId) as AssignedTaskDetailsRow[];

    return tasks.map((t) => ({
      ...mapTaskDetailsRow(t),
      columnName: t.column_name,
      boardName: t.board_name,
      boardSlug: t.board_slug,
      teamName: t.team_name,
      teamSlug: t.team_slug,
    }));
  }

  // ─── Checklist ──────────────────────────────────────────────────────────
  getChecklist(
    taskId: string
  ): Array<{ id: string; text: string; completed: boolean; position: number }> {
    const rows = db
      .prepare(
        'SELECT id, text, completed, position FROM task_checklist WHERE task_id = ? ORDER BY position, created_at'
      )
      .all(taskId) as Array<{ id: string; text: string; completed: number; position: number }>;
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      completed: !!r.completed,
      position: r.position,
    }));
  }

  addChecklistItem(taskId: string, text: string): { id: string; text: string } {
    const id = nanoid();
    const pos = (
      db
        .prepare(
          'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM task_checklist WHERE task_id = ?'
        )
        .get(taskId) as { p: number }
    ).p;
    db.prepare(
      'INSERT INTO task_checklist (id, task_id, text, completed, position) VALUES (?, ?, ?, 0, ?)'
    ).run(id, taskId, text.trim(), pos);
    return { id, text: text.trim() };
  }

  toggleChecklistItem(taskId: string, itemId: string): boolean {
    const row = db
      .prepare('SELECT completed FROM task_checklist WHERE id = ? AND task_id = ?')
      .get(itemId, taskId) as { completed: number } | undefined;
    if (!row) throw new NotFoundError('Checklist item');
    const next = row.completed ? 0 : 1;
    db.prepare('UPDATE task_checklist SET completed = ? WHERE id = ? AND task_id = ?').run(
      next,
      itemId,
      taskId
    );
    return !!next;
  }

  updateChecklistItem(taskId: string, itemId: string, text: string): void {
    const result = db
      .prepare('UPDATE task_checklist SET text = ? WHERE id = ? AND task_id = ?')
      .run(text.trim(), itemId, taskId);
    if (result.changes === 0) throw new NotFoundError('Checklist item');
  }

  deleteChecklistItem(taskId: string, itemId: string): void {
    const result = db
      .prepare('DELETE FROM task_checklist WHERE id = ? AND task_id = ?')
      .run(itemId, taskId);
    if (result.changes === 0) throw new NotFoundError('Checklist item');
  }
}

export const taskService = new TaskService();
