import { nanoid } from 'nanoid';
import type { z } from 'zod';
import { db } from '../config/database';
import type { Board, BoardWithColumns, BoardWithStats, Column } from '../models/board.model';
import type { createBoardSchema, createColumnSchema, updateBoardSchema } from '../schemas/boards';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { slugify } from '../utils/slug';

export type CreateBoardInput = z.infer<typeof createBoardSchema> & { teamId: string };
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type CreateColumnInput = z.infer<typeof createColumnSchema> & {
  boardId: string;
  position?: number;
};

/** Task row for the column-tasks fragment, joined with assignee info. */
export interface ColumnTaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_seed: string | null;
}

/** Board row with a column count, for the team detail page. */
export interface BoardWithColumnCount {
  slug: string;
  name: string;
  description: string | null;
  columnCount: number;
}

export class BoardService {
  // Create a new board with default columns
  async createBoard(input: CreateBoardInput): Promise<Board> {
    const { teamId, name, description = null } = input;
    const slug = slugify(name);
    if (!slug) {
      throw new ValidationError('Board name must include at least one letter or number');
    }

    // Check if slug already exists for this team
    const existingSlug = db
      .prepare('SELECT id FROM boards WHERE team_id = ? AND slug = ?')
      .get(teamId, slug);
    if (existingSlug) {
      throw new ConflictError('Board URL already taken for this team');
    }

    // Create board
    const boardId = nanoid();
    const now = new Date().toISOString();

    const defaultColumns = [
      { name: 'Backlog', position: 0, color: '#e5e7eb' },
      { name: 'To Do', position: 1, color: '#dbeafe' },
      { name: 'In Progress', position: 2, color: '#fef3c7' },
      { name: 'Done', position: 3, color: '#d1fae5' },
    ];

    const stmt = db.prepare(
      'INSERT INTO columns (id, board_id, name, position, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    db.transaction(() => {
      db.prepare(
        'INSERT INTO boards (id, team_id, name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(boardId, teamId, name, slug, description, now, now);
      for (const col of defaultColumns) {
        stmt.run(nanoid(), boardId, col.name, col.position, col.color, now, now);
      }
    })();

    return this.getById(boardId);
  }

  // Get board by ID
  getById(boardId: string): Board {
    const board = db
      .prepare(
        `
        SELECT id, team_id as teamId, name, slug, description,
               created_at as createdAt, updated_at as updatedAt
        FROM boards WHERE id = ?
      `
      )
      .get(boardId) as Board | undefined;

    if (!board) {
      throw new NotFoundError('Board');
    }

    return board;
  }

  // Get board by slug within a team
  getBySlug(teamId: string, slug: string): Board {
    const board = db
      .prepare(
        `
        SELECT id, team_id as teamId, name, slug, description,
               created_at as createdAt, updated_at as updatedAt
        FROM boards WHERE team_id = ? AND slug = ?
      `
      )
      .get(teamId, slug) as Board | undefined;

    if (!board) {
      throw new NotFoundError('Board');
    }

    return board;
  }

  // Get all boards for a team
  getBoardsForTeam(teamId: string): BoardWithStats[] {
    const boards = db
      .prepare(
        `
        SELECT
          b.*,
          COUNT(DISTINCT c.id) as column_count,
          COUNT(DISTINCT t.id) as task_count
        FROM boards b
        LEFT JOIN columns c ON c.board_id = b.id
        LEFT JOIN tasks t ON t.column_id = c.id
        WHERE b.team_id = ?
        GROUP BY b.id
        ORDER BY b.name
      `
      )
      .all(teamId) as Array<{
      id: string;
      team_id: string;
      name: string;
      slug: string;
      description: string | null;
      created_at: string;
      updated_at: string;
      column_count: number;
      task_count: number;
    }>;

    return boards.map((b) => ({
      id: b.id,
      teamId: b.team_id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      createdAt: new Date(b.created_at),
      updatedAt: new Date(b.updated_at),
      columnCount: b.column_count,
      taskCount: b.task_count,
    }));
  }

  // Batch-fetch boards for multiple team IDs (avoids N+1 on dashboard).
  getBoardsForTeamIds(teamIds: string[]): Board[] {
    if (teamIds.length === 0) return [];
    const placeholders = teamIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `
        SELECT id, team_id as teamId, name, slug, description,
               created_at as createdAt, updated_at as updatedAt
        FROM boards WHERE team_id IN (${placeholders})
        ORDER BY name
      `
      )
      .all(...teamIds) as Board[];
    return rows;
  }

  // Boards with column counts for the team detail page.
  getBoardsWithColumnCount(teamId: string): BoardWithColumnCount[] {
    return db
      .prepare(
        `
        SELECT
          b.slug,
          b.name,
          b.description,
          COUNT(c.id) as columnCount
        FROM boards b
        LEFT JOIN columns c ON c.board_id = b.id
        WHERE b.team_id = ?
        GROUP BY b.id
        ORDER BY b.name
      `
      )
      .all(teamId) as BoardWithColumnCount[];
  }

  // Tasks for the column-tasks fragment, with optional search/archive/assignee filters.
  getColumnTasks(
    columnId: string,
    filters: { search?: string; archived?: boolean; assigneeId?: string } = {}
  ): ColumnTaskRow[] {
    const { search = '', archived = false, assigneeId } = filters;
    const searchClause = search
      ? `AND (LOWER(t.title) LIKE ? OR LOWER(COALESCE(t.description,'')) LIKE ?)`
      : '';
    const archiveClause = archived ? 'AND t.archived = 1' : 'AND t.archived = 0';

    let query = `
        SELECT
          t.*,
          a.id as assignee_id,
          a.display_name as assignee_name,
          a.avatar_seed as assignee_seed
        FROM tasks t
        LEFT JOIN users a ON a.id = t.assignee_id
        WHERE t.column_id = ?
          ${archiveClause}
          ${searchClause}
      `;

    const queryParams: string[] = [columnId];
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      queryParams.push(like, like);
    }

    if (assigneeId) {
      query += ' AND t.assignee_id = ?';
      queryParams.push(assigneeId);
    }

    query += ' ORDER BY t.position';

    return db.prepare(query).all(...queryParams) as ColumnTaskRow[];
  }

  // Get board with columns
  getBoardWithColumns(boardId: string): BoardWithColumns {
    const board = this.getById(boardId);

    const columns = db
      .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position')
      .all(boardId) as Column[];

    return {
      ...board,
      columns: columns.map((c) => ({
        id: c.id,
        boardId: c.boardId,
        name: c.name,
        position: c.position,
        wipLimit: c.wipLimit,
        color: c.color,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      })),
    };
  }

  // Update board
  async updateBoard(boardId: string, input: UpdateBoardInput): Promise<Board> {
    const { name, description } = input;

    if (name !== undefined) {
      const board = this.getById(boardId);
      const newSlug = slugify(name);

      // Check if new slug conflicts
      const existingSlug = db
        .prepare('SELECT id FROM boards WHERE team_id = ? AND slug = ? AND id != ?')
        .get(board.teamId, newSlug, boardId);
      if (existingSlug) {
        throw new ConflictError('Board URL already taken for this team');
      }

      db.prepare('UPDATE boards SET name = ?, slug = ?, updated_at = ? WHERE id = ?').run(
        name,
        newSlug,
        new Date().toISOString(),
        boardId
      );
    }

    if (description !== undefined) {
      db.prepare('UPDATE boards SET description = ?, updated_at = ? WHERE id = ?').run(
        description,
        new Date().toISOString(),
        boardId
      );
    }

    return this.getById(boardId);
  }

  // Delete board
  deleteBoard(boardId: string): void {
    db.prepare('DELETE FROM boards WHERE id = ?').run(boardId);
  }

  // Column operations (position assignment is transactional)
  async createColumn(input: CreateColumnInput): Promise<Column> {
    const { boardId, name, wipLimit, color } = input;
    const columnId = nanoid();
    const now = new Date().toISOString();

    db.transaction(() => {
      const position =
        input.position ??
        (
          db
            .prepare(
              'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM columns WHERE board_id = ?'
            )
            .get(boardId) as { next_pos: number }
        ).next_pos;

      db.prepare(
        'INSERT INTO columns (id, board_id, name, position, wip_limit, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(columnId, boardId, name, position, wipLimit ?? null, color ?? null, now, now);
    })();

    return this.getColumnById(columnId);
  }

  getColumnById(columnId: string): Column {
    const column = db
      .prepare(
        `
        SELECT id, board_id as boardId, name, position, wip_limit as wipLimit,
               color, created_at as createdAt, updated_at as updatedAt
        FROM columns WHERE id = ?
      `
      )
      .get(columnId) as Column | undefined;

    if (!column) {
      throw new NotFoundError('Column');
    }

    return column;
  }

  getColumnsForBoard(boardId: string): Column[] {
    const columns = db
      .prepare(
        `
        SELECT id, board_id as boardId, name, position, wip_limit as wipLimit,
               color, created_at as createdAt, updated_at as updatedAt
        FROM columns WHERE board_id = ? ORDER BY position
      `
      )
      .all(boardId) as Column[];

    return columns;
  }

  async updateColumn(
    columnId: string,
    input: Partial<Pick<Column, 'name' | 'position' | 'wipLimit' | 'color'>>
  ): Promise<Column> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.position !== undefined) {
      updates.push('position = ?');
      values.push(input.position);
    }
    if (input.wipLimit !== undefined) {
      updates.push('wip_limit = ?');
      values.push(input.wipLimit ?? null);
    }
    if (input.color !== undefined) {
      updates.push('color = ?');
      values.push(input.color ?? null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(columnId);

      const sql = `UPDATE columns SET ${updates.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...(values as [string, ...Array<string | number | null>]));
    }

    return this.getColumnById(columnId);
  }

  deleteColumn(columnId: string): void {
    const column = this.getColumnById(columnId);
    db.transaction(() => {
      db.prepare('DELETE FROM columns WHERE id = ?').run(columnId);
      // Renumber remaining columns in the same board to close gaps
      const remaining = db
        .prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position')
        .all(column.boardId) as { id: string }[];
      const now = new Date().toISOString();
      const updatePos = db.prepare('UPDATE columns SET position = ?, updated_at = ? WHERE id = ?');
      remaining.forEach((col, i) => {
        if (col) updatePos.run(i, now, col.id);
      });
    })();
  }

  // Reorder columns (transactional — all positions update atomically)
  async reorderColumns(boardId: string, columnIds: string[]): Promise<void> {
    const existing = db
      .prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position')
      .all(boardId) as Array<{ id: string }>;
    const existingIds = existing.map((column) => column.id);
    if (
      columnIds.length !== existingIds.length ||
      new Set(columnIds).size !== columnIds.length ||
      existingIds.some((id) => !columnIds.includes(id))
    ) {
      throw new ValidationError('Column order must include every column exactly once');
    }
    const stmt = db.prepare(
      'UPDATE columns SET position = ?, updated_at = ? WHERE id = ? AND board_id = ?'
    );
    const now = new Date().toISOString();

    db.transaction(() => {
      for (let i = 0; i < columnIds.length; i++) {
        const colId = columnIds[i];
        if (colId) {
          stmt.run(i, now, colId, boardId);
        }
      }
    })();
  }
}

export const boardService = new BoardService();
