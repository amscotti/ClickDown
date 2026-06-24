import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase } from '../test-helper';

// In-memory DB shared by the route handler and the services it calls.
const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { handleRequest } from '../../src/index';
import { boardService } from '../../src/services/board.service';
import { taskService } from '../../src/services/task.service';
import { teamService } from '../../src/services/team.service';
import { tokenService } from '../../src/services/token.service';
import { userService } from '../../src/services/user.service';

const BASE = 'http://localhost';
const PASSWORD = 'Password123!';

let token = '';
let userId = '';
let teamSlug = '';
let boardSlug = '';

function mcp(method: string, params?: unknown, id: number | string = 1): Request {
  return new Request(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

async function rpc(toolName: string, args?: Record<string, unknown>): Promise<unknown> {
  const res = await handleRequest(mcp('tools/call', { name: toolName, arguments: args ?? {} }));
  if (!res) throw new Error('No response');
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    result?: { content?: Array<{ text: string }>; isError?: boolean };
    error?: { code: number; message: string };
  };
  if (body.error) throw new Error(`RPC error ${body.error.code}: ${body.error.message}`);
  const result = body.result;
  if (result?.isError) throw new Error(`Tool error: ${result.content?.[0]?.text}`);
  const text = result?.content?.[0]?.text;
  return text ? JSON.parse(text) : result;
}

async function rpcRaw(req: Request): Promise<Response> {
  const res = await handleRequest(req);
  if (!res) throw new Error('No response');
  return res;
}

describe('MCP endpoint', () => {
  beforeEach(async () => {
    testDb.run('DELETE FROM task_comments');
    testDb.run('DELETE FROM task_labels');
    testDb.run('DELETE FROM labels');
    testDb.run('DELETE FROM task_checklist');
    testDb.run('DELETE FROM tasks');
    testDb.run('DELETE FROM columns');
    testDb.run('DELETE FROM boards');
    testDb.run('DELETE FROM team_members');
    testDb.run('DELETE FROM teams');
    testDb.run('DELETE FROM api_tokens');
    testDb.run('DELETE FROM sessions');
    testDb.run('DELETE FROM users');

    const user = await userService.register({
      email: 'mcp@example.com',
      password: PASSWORD,
      displayName: 'MCP User',
    });
    userId = user.user.id;
    const team = await teamService.createTeam({ name: 'MCP Team', ownerId: userId });
    teamSlug = team.slug;
    const board = await boardService.createBoard({ teamId: team.id, name: 'MCP Board' });
    boardSlug = board.slug;
    token = tokenService.create(userId, 'test-agent').token;
  });

  // ─── Protocol ──────────────────────────────────────────────────────────

  test('initialize returns server info and capabilities', async () => {
    const res = await rpcRaw(mcp('initialize', { protocolVersion: '2025-06-18' }));
    const body = (await res.json()) as {
      result: {
        protocolVersion: string;
        serverInfo: { name: string };
        capabilities: { tools: object };
      };
    };
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.serverInfo.name).toBe('clickdown');
    expect(body.result.capabilities.tools).toBeDefined();
  });

  test('tools/list returns all task-management tools', async () => {
    const res = await rpcRaw(mcp('tools/list'));
    const body = (await res.json()) as {
      result: { tools: Array<{ name: string; inputSchema: object }> };
    };
    const names = body.result.tools.map((t) => t.name);
    for (const expected of [
      'list_teams',
      'list_boards',
      'get_board',
      'list_tasks',
      'get_task',
      'create_task',
      'update_task',
      'move_task',
      'archive_task',
      'delete_task',
      'add_comment',
      'add_checklist_item',
      'toggle_checklist_item',
      'delete_checklist_item',
      'search_tasks',
      'get_my_tasks',
    ]) {
      expect(names).toContain(expected);
    }
  });

  test('notifications receive 202 with no body', async () => {
    const req = new Request(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    const res = await rpcRaw(req);
    expect(res.status).toBe(202);
  });

  test('unknown methods return JSON-RPC error -32601', async () => {
    const res = await rpcRaw(mcp('bogus/method'));
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  test('invalid JSON returns parse error', async () => {
    const req = new Request(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{ not json',
    });
    const res = await rpcRaw(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  test('batch requests are processed in order', async () => {
    const req = new Request(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]),
    });
    const res = await rpcRaw(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: number; result: unknown }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.id).toBe(1);
    expect(body[1]?.id).toBe(2);
  });

  // ─── Auth ────────────────────────────────────────────────────────────────

  test('missing token returns 401', async () => {
    const req = new Request(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    const res = await rpcRaw(req);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
  });

  test('revoked token returns 401', async () => {
    const { token: t2, record } = tokenService.create(userId, 'revoke-me');
    tokenService.revoke(userId, record.id);
    const req = new Request(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t2}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    const res = await rpcRaw(req);
    expect(res.status).toBe(401);
  });

  test('session cookies are NOT accepted on the MCP endpoint', async () => {
    const login = await userService.login('mcp@example.com', PASSWORD);
    const req = new Request(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_id=${login.sessionId}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    const res = await rpcRaw(req);
    expect(res.status).toBe(401);
  });

  test('GET returns 405 with Allow: POST', async () => {
    const req = new Request(`${BASE}/api/mcp`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await rpcRaw(req);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });

  // ─── Tool behavior ─────────────────────────────────────────────────────

  test('list_teams → list_boards → get_board flow returns usable data', async () => {
    const teams = (await rpc('list_teams')) as { teams: Array<{ slug: string; name: string }> };
    expect(teams.teams[0]?.slug).toBe(teamSlug);

    const boards = (await rpc('list_boards', { teamSlug })) as {
      boards: Array<{ slug: string; columns: Array<{ id: string; name: string }> }>;
    };
    expect(boards.boards[0]?.slug).toBe(boardSlug);
    expect(boards.boards[0]?.columns.length).toBeGreaterThan(0);

    const board = (await rpc('get_board', { teamSlug, boardSlug })) as {
      board: { name: string; columns: Array<{ name: string }> };
    };
    expect(board.board.name).toBe('MCP Board');
  });

  test('create_task → get_task → update_task → move_task → archive_task flow', async () => {
    const created = (await rpc('create_task', {
      teamSlug,
      boardSlug,
      title: 'MCP Task',
      description: 'Created by an agent',
      priority: 'high',
      assignToMe: true,
    })) as { task: { id: string } };
    const taskId = created.task.id;

    const detail = (await rpc('get_task', { taskId })) as {
      task: {
        title: string;
        priority: string;
        assignee: { id: string } | null;
        column: { name: string };
        board: { slug: string };
        team: { slug: string };
      };
    };
    expect(detail.task.title).toBe('MCP Task');
    expect(detail.task.priority).toBe('high');
    expect(detail.task.assignee?.id).toBe(userId);
    expect(detail.task.board.slug).toBe(boardSlug);
    expect(detail.task.team.slug).toBe(teamSlug);

    await rpc('update_task', { taskId, title: 'MCP Task (updated)', priority: 'urgent' });
    const afterUpdate = (await rpc('get_task', { taskId })) as {
      task: { title: string; priority: string };
    };
    expect(afterUpdate.task.title).toBe('MCP Task (updated)');
    expect(afterUpdate.task.priority).toBe('urgent');

    const board = (await rpc('get_board', { teamSlug, boardSlug })) as {
      board: { columns: Array<{ id: string; name: string }> };
    };
    const doneColumn = board.board.columns.find((c) => c.name === 'Done');
    expect(doneColumn).toBeDefined();
    await rpc('move_task', { taskId, columnId: doneColumn?.id });
    const afterMove = (await rpc('get_task', { taskId })) as {
      task: { column: { name: string } };
    };
    expect(afterMove.task.column.name).toBe('Done');

    await rpc('archive_task', { taskId, archived: true });
    const archived = (await rpc('get_task', { taskId })) as { task: { archived: boolean } };
    expect(archived.task.archived).toBe(true);
  });

  test('checklist tools add, toggle, and delete items', async () => {
    const created = (await rpc('create_task', {
      teamSlug,
      boardSlug,
      title: 'Checklist Task',
    })) as {
      task: { id: string };
    };
    const taskId = created.task.id;

    const added = (await rpc('add_checklist_item', { taskId, text: 'Step one' })) as {
      item: { id: string; completed: boolean };
    };
    expect(added.item.completed).toBe(false);

    const toggled = (await rpc('toggle_checklist_item', { taskId, itemId: added.item.id })) as {
      item: { completed: boolean };
    };
    expect(toggled.item.completed).toBe(true);

    const detail = (await rpc('get_task', { taskId })) as {
      checklist: { total: number; completed: number };
    };
    expect(detail.checklist.total).toBe(1);
    expect(detail.checklist.completed).toBe(1);

    await rpc('delete_checklist_item', { taskId, itemId: added.item.id });
    const afterDelete = (await rpc('get_task', { taskId })) as {
      checklist: { total: number };
    };
    expect(afterDelete.checklist.total).toBe(0);
  });

  test('add_comment stores a comment visible in get_task', async () => {
    const created = (await rpc('create_task', { teamSlug, boardSlug, title: 'Comment Task' })) as {
      task: { id: string };
    };
    const taskId = created.task.id;
    await rpc('add_comment', { taskId, body: 'Progress note from agent' });
    const detail = (await rpc('get_task', { taskId })) as {
      comments: Array<{ body: string; author: { name: string } }>;
    };
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0]?.body).toBe('Progress note from agent');
    expect(detail.comments[0]?.author.name).toBe('MCP User');
  });

  test('list_tasks filters by assignee and search_tasks finds text', async () => {
    await rpc('create_task', {
      teamSlug,
      boardSlug,
      title: 'Fix login redirect bug',
      assignToMe: true,
    });
    await rpc('create_task', { teamSlug, boardSlug, title: 'Update landing page' });

    const mine = (await rpc('list_tasks', { teamSlug, boardSlug, assignedToMe: true })) as {
      count: number;
      tasks: Array<{ title: string }>;
    };
    expect(mine.count).toBe(1);
    expect(mine.tasks[0]?.title).toBe('Fix login redirect bug');

    const found = (await rpc('search_tasks', { query: 'login redirect' })) as {
      count: number;
      tasks: Array<{ title: string }>;
    };
    expect(found.count).toBe(1);

    const myTasks = (await rpc('get_my_tasks')) as { count: number };
    expect(myTasks.count).toBe(1);
  });

  test('delete_task removes the task permanently', async () => {
    const created = (await rpc('create_task', { teamSlug, boardSlug, title: 'Delete me' })) as {
      task: { id: string };
    };
    await rpc('delete_task', { taskId: created.task.id });
    const res = await rpcRaw(
      mcp('tools/call', { name: 'get_task', arguments: { taskId: created.task.id } })
    );
    const body = (await res.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain('not found');
  });

  // ─── Access control ────────────────────────────────────────────────────

  test('non-member cannot access team data via MCP', async () => {
    const outsider = await userService.register({
      email: 'outsider@example.com',
      password: PASSWORD,
      displayName: 'Outsider',
    });
    const outsiderToken = tokenService.create(outsider.user.id, 'outsider-agent').token;

    const req = new Request(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${outsiderToken}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_boards', arguments: { teamSlug } },
      }),
    });
    const res = await rpcRaw(req);
    const body = (await res.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain('not a member');
  });

  test('task created via MCP is visible to the regular services', async () => {
    const created = (await rpc('create_task', { teamSlug, boardSlug, title: 'Cross-check' })) as {
      task: { id: string };
    };
    const task = taskService.getByIdWithDetails(created.task.id);
    expect(task.title).toBe('Cross-check');
  });
});
