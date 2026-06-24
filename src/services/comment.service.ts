import { nanoid } from 'nanoid';
import { db } from '../config/database';

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  userName: string;
  userAvatarSeed: string;
}

export class CommentService {
  listForTask(taskId: string): TaskComment[] {
    const rows = db
      .prepare(
        `SELECT c.*, u.display_name as user_name, u.avatar_seed as user_avatar_seed
         FROM task_comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.task_id = ?
         ORDER BY c.created_at ASC`
      )
      .all(taskId) as Array<{
      id: string;
      task_id: string;
      user_id: string;
      body: string;
      created_at: string;
      updated_at: string;
      user_name: string;
      user_avatar_seed: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      userId: r.user_id,
      body: r.body,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      userName: r.user_name,
      userAvatarSeed: r.user_avatar_seed,
    }));
  }

  add(taskId: string, userId: string, body: string): TaskComment {
    const id = nanoid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO task_comments (id, task_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, taskId, userId, body.trim(), now, now);
    const list = this.listForTask(taskId);
    const created = list.find((c) => c.id === id);
    if (!created) throw new Error('Failed to create comment');
    return created;
  }

  delete(commentId: string, userId: string, isAdmin: boolean): void {
    const row = db.prepare('SELECT user_id FROM task_comments WHERE id = ?').get(commentId) as
      | { user_id: string }
      | undefined;
    if (!row) throw new Error('Comment not found');
    if (row.user_id !== userId && !isAdmin) {
      throw new Error('Access Denied');
    }
    db.prepare('DELETE FROM task_comments WHERE id = ?').run(commentId);
  }
}

export const commentService = new CommentService();
