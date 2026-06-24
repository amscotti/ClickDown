import { nanoid } from 'nanoid';
import { db } from '../config/database';

export interface Label {
  id: string;
  teamId: string;
  name: string;
  color: string;
  createdAt: Date;
}

export class LabelService {
  private safeColor(color: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6366f1';
  }

  listForTeam(teamId: string): Label[] {
    const rows = db
      .prepare('SELECT * FROM labels WHERE team_id = ? ORDER BY name')
      .all(teamId) as Array<{
      id: string;
      team_id: string;
      name: string;
      color: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      teamId: r.team_id,
      name: r.name,
      color: this.safeColor(r.color),
      createdAt: new Date(r.created_at),
    }));
  }

  listForTask(taskId: string): Label[] {
    const rows = db
      .prepare(
        `SELECT l.* FROM labels l
         JOIN task_labels tl ON tl.label_id = l.id
         WHERE tl.task_id = ?
         ORDER BY l.name`
      )
      .all(taskId) as Array<{
      id: string;
      team_id: string;
      name: string;
      color: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      teamId: r.team_id,
      name: r.name,
      color: this.safeColor(r.color),
      createdAt: new Date(r.created_at),
    }));
  }

  create(teamId: string, name: string, color = '#6366f1'): Label {
    if (name.trim().length === 0 || name.trim().length > 40) {
      throw new Error('Label names must be 1-40 characters');
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Invalid label color');
    const id = nanoid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO labels (id, team_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, teamId, name.trim(), color, now);
    return {
      id,
      teamId,
      name: name.trim(),
      color,
      createdAt: new Date(now),
    };
  }

  addToTask(taskId: string, labelId: string): void {
    const valid = db
      .prepare(
        `SELECT 1 FROM tasks t
         JOIN columns c ON c.id = t.column_id
         JOIN boards b ON b.id = c.board_id
         JOIN labels l ON l.id = ?
         WHERE t.id = ? AND l.team_id = b.team_id`
      )
      .get(labelId, taskId);
    if (!valid) throw new Error('Label does not belong to the task team');
    db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)').run(
      taskId,
      labelId
    );
  }

  removeFromTask(taskId: string, labelId: string): void {
    db.prepare('DELETE FROM task_labels WHERE task_id = ? AND label_id = ?').run(taskId, labelId);
  }

  delete(labelId: string, teamId: string): void {
    db.prepare('DELETE FROM labels WHERE id = ? AND team_id = ?').run(labelId, teamId);
  }
}

export const labelService = new LabelService();
