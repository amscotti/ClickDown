import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from '../test-helper';

const uploadTmpDir = mkdtempSync(join(tmpdir(), 'clickdown-att-test-'));
process.env.UPLOAD_DIR = uploadTmpDir;

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { handleRequest } from '../../src/index';
import { attachmentPath, attachmentService } from '../../src/services/attachment.service';
import { boardService } from '../../src/services/board.service';
import { taskService } from '../../src/services/task.service';
import { teamService } from '../../src/services/team.service';
import { userService } from '../../src/services/user.service';
import { resetRateLimit } from '../../src/utils/rate-limit';

const BASE = 'http://localhost';

function extractSession(res: Response): string | null {
  const sc = res.headers.get('Set-Cookie');
  if (!sc) return null;
  const m = sc.match(/session_id=([^;]+)/);
  return m ? (m[1] ?? null) : null;
}

describe('Attachment hardening integration', () => {
  let cookie = '';
  let taskId = '';

  beforeAll(async () => {
    const reg = await userService.register({
      email: 'att-sec@example.com',
      password: 'Password123!',
      displayName: 'Att Sec',
    });
    const loginRes = await handleRequest(
      new Request(`${BASE}/login`, {
        method: 'POST',
        body: new URLSearchParams({ email: reg.user.email, password: 'Password123!' }),
        headers: { 'HX-Request': 'true' },
      })
    );
    cookie = extractSession(loginRes ?? new Response()) ?? reg.sessionId;
    const team = await teamService.createTeam({ name: 'Att Team', ownerId: reg.user.id });
    const board = await boardService.createBoard({ teamId: team.id, name: 'Att Board' });
    const col = boardService.getColumnsForBoard(board.id)[0];
    if (!col) throw new Error('Expected default column');
    const task = await taskService.createTask({
      columnId: col.id,
      title: 'Att Task',
      createdBy: reg.user.id,
    });
    taskId = task.id;
  });

  beforeEach(() => {
    resetRateLimit();
  });

  test('coerces scriptable SVG upload MIME type to application/octet-stream on download', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File(
        ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
        'xss.svg',
        {
          type: 'image/svg+xml',
        }
      )
    );

    const uploadRes = await handleRequest(
      new Request(`${BASE}/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: form,
        headers: { Cookie: `session_id=${cookie}` },
      })
    );
    expect(uploadRes?.status).toBe(200);
    const list = attachmentService.listForTask(taskId);
    const att = list[0];
    expect(att).toBeDefined();
    if (!att) return;

    try {
      const downloadRes = await handleRequest(
        new Request(`${BASE}/attachments/${att.id}/download`, {
          headers: { Cookie: `session_id=${cookie}` },
        })
      );
      expect(downloadRes?.status).toBe(200);
      expect(downloadRes?.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(downloadRes?.headers.get('Content-Disposition')).toContain('attachment');
      expect(downloadRes?.headers.get('Cache-Control')).toBe('private, no-store');

      // Removing stored file on disk returns clean 404 instead of internal error
      unlinkSync(attachmentPath(att.storedName));
      const missingRes = await handleRequest(
        new Request(`${BASE}/attachments/${att.id}/download`, {
          headers: { Cookie: `session_id=${cookie}` },
        })
      );
      expect(missingRes?.status).toBe(404);
    } finally {
      attachmentService.delete(att.id);
      rmSync(uploadTmpDir, { recursive: true, force: true });
    }
  });
});
