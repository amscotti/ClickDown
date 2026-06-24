import { mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { nanoid } from 'nanoid';
import { db } from '../config/database';

export interface TaskAttachment {
  id: string;
  taskId: string;
  userId: string;
  filename: string;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: Date;
  userName?: string;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');

export function ensureUploadDir(): string {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

export function attachmentPath(storedName: string): string {
  return join(ensureUploadDir(), storedName);
}

export class AttachmentService {
  listForTask(taskId: string): TaskAttachment[] {
    const rows = db
      .prepare(
        `SELECT a.*, u.display_name as user_name
         FROM task_attachments a
         JOIN users u ON u.id = a.user_id
         WHERE a.task_id = ?
         ORDER BY a.created_at DESC`
      )
      .all(taskId) as Array<{
      id: string;
      task_id: string;
      user_id: string;
      filename: string;
      stored_name: string;
      mime_type: string | null;
      size_bytes: number;
      created_at: string;
      user_name: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      userId: r.user_id,
      filename: r.filename,
      storedName: r.stored_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      createdAt: new Date(r.created_at),
      userName: r.user_name,
    }));
  }

  async add(taskId: string, userId: string, file: File): Promise<TaskAttachment> {
    const id = nanoid();
    const ext = extname(file.name);
    const storedName = `${id}${ext}`;
    const dir = ensureUploadDir();
    const dest = join(dir, storedName);
    const temporary = `${dest}.uploading`;
    await Bun.write(temporary, file);

    const now = new Date().toISOString();
    try {
      db.prepare(
        `INSERT INTO task_attachments
         (id, task_id, user_id, filename, stored_name, mime_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, taskId, userId, file.name, storedName, file.type || null, file.size, now);
      try {
        renameSync(temporary, dest);
      } catch (error) {
        db.prepare('DELETE FROM task_attachments WHERE id = ?').run(id);
        throw error;
      }
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        // The temporary file may already have been renamed or removed.
      }
      throw error;
    }

    return {
      id,
      taskId,
      userId,
      filename: file.name,
      storedName,
      mimeType: file.type || null,
      sizeBytes: file.size,
      createdAt: new Date(now),
    };
  }

  getById(id: string): TaskAttachment | null {
    const r = db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(id) as
      | {
          id: string;
          task_id: string;
          user_id: string;
          filename: string;
          stored_name: string;
          mime_type: string | null;
          size_bytes: number;
          created_at: string;
        }
      | undefined;
    if (!r) return null;
    return {
      id: r.id,
      taskId: r.task_id,
      userId: r.user_id,
      filename: r.filename,
      storedName: r.stored_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      createdAt: new Date(r.created_at),
    };
  }

  delete(id: string): void {
    const att = this.getById(id);
    if (!att) return;
    const path = attachmentPath(att.storedName);
    const deletingPath = `${path}.deleting`;
    try {
      renameSync(path, deletingPath);
    } catch {
      // Missing files should not prevent deleting stale metadata.
    }
    try {
      db.prepare('DELETE FROM task_attachments WHERE id = ?').run(id);
    } catch (error) {
      try {
        renameSync(deletingPath, path);
      } catch {
        // Preserve the database error; reconciliation can repair a missing file.
      }
      throw error;
    }
    try {
      unlinkSync(deletingPath);
    } catch {
      // Metadata is gone; a startup reconciliation can remove a stale tombstone.
    }
  }
}

export const attachmentService = new AttachmentService();
