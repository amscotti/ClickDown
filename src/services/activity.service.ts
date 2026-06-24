import { nanoid } from 'nanoid';
import { db } from '../config/database';

export interface ActivityEntry {
  id: string;
  taskId: string;
  event: string;
  detail: string | null;
  userName: string | null;
  createdAt: Date;
}

export class ActivityService {
  record(taskId: string, event: string, userId: string | null, detail?: string): void {
    db.prepare(
      'INSERT INTO task_activity (id, task_id, event, detail, user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(nanoid(), taskId, event, detail ?? null, userId);
  }

  getForTask(taskId: string, limit = 15): ActivityEntry[] {
    const rows = db
      .prepare(
        `SELECT a.id, a.task_id, a.event, a.detail, a.created_at, u.display_name AS user_name
         FROM task_activity a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.task_id = ?
         ORDER BY a.created_at DESC, a.rowid DESC
         LIMIT ?`
      )
      .all(taskId, limit) as Array<{
      id: string;
      task_id: string;
      event: string;
      detail: string | null;
      created_at: string;
      user_name: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      event: r.event,
      detail: r.detail,
      userName: r.user_name,
      createdAt: new Date(r.created_at),
    }));
  }
}

export const activityService = new ActivityService();
