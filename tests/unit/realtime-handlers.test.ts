import { beforeAll, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import type { Server, ServerWebSocket } from 'bun';
import { handleWsUpgrade, wsHandlers } from '../../src/realtime/handlers';
import type { WsData } from '../../src/realtime/realtime';

const BASE = 'http://localhost';
let sessionId: string;
let boardId: string;
let teamId: string;
let userId: string;

function makeMockServer(upgradeResult: boolean): Server<WsData> {
  return {
    upgrade: mock(() => upgradeResult),
  } as unknown as Server<WsData>;
}

function wsReq(query: string, headers: Record<string, string> = {}): { req: Request; url: URL } {
  const req = new Request(`${BASE}/ws/board?${query}`, { headers });
  return { req, url: new URL(req.url) };
}

describe('handleWsUpgrade', () => {
  beforeAll(() => {
    userId = crypto.randomUUID();
    testDb
      .prepare(
        'INSERT INTO users (id, email, password_hash, display_name, avatar_seed) VALUES (?, ?, ?, ?, ?)'
      )
      .run(userId, 'ws@example.com', 'hash', 'WS User', 'seed');

    sessionId = crypto.randomUUID();
    testDb
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sessionId, userId, new Date(Date.now() + 86_400_000).toISOString());

    teamId = crypto.randomUUID();
    testDb
      .prepare(
        'INSERT INTO teams (id, name, slug, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(teamId, 'WS Team', 'ws-team', null, userId, new Date().toISOString());

    testDb
      .prepare('INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(teamId, userId, 'owner', new Date().toISOString());

    boardId = crypto.randomUUID();
    testDb
      .prepare(
        'INSERT INTO boards (id, team_id, name, slug, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(boardId, teamId, 'WS Board', 'ws-board', null, new Date().toISOString());
  });

  test('returns 401 when no session cookie is provided', () => {
    const { req, url } = wsReq(`boardId=${boardId}`);
    const res = handleWsUpgrade(req, makeMockServer(true), url);
    expect(res?.status).toBe(401);
  });

  test('returns 401 for an invalid/expired session', () => {
    const { req, url } = wsReq(`boardId=${boardId}`, { Cookie: 'session_id=invalid' });
    const res = handleWsUpgrade(req, makeMockServer(true), url);
    expect(res?.status).toBe(401);
  });

  test('returns 403 when Origin header does not match', () => {
    const { req, url } = wsReq(`boardId=${boardId}`, {
      Cookie: `session_id=${sessionId}`,
      Origin: 'https://evil.example.com',
    });
    const res = handleWsUpgrade(req, makeMockServer(true), url);
    expect(res?.status).toBe(403);
  });

  test('allows same-origin Origin header', () => {
    const { req, url } = wsReq(`boardId=${boardId}`, {
      Cookie: `session_id=${sessionId}`,
      Origin: BASE,
    });
    const res = handleWsUpgrade(req, makeMockServer(true), url);
    expect(res).toBeUndefined();
  });

  test('allows absent Origin header (dev/E2E)', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const { req, url } = wsReq(`boardId=${boardId}`, {
        Cookie: `session_id=${sessionId}`,
      });
      const res = handleWsUpgrade(req, makeMockServer(true), url);
      expect(res).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test('rejects absent Origin header in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { req, url } = wsReq(`boardId=${boardId}`, {
        Cookie: `session_id=${sessionId}`,
      });
      const res = handleWsUpgrade(req, makeMockServer(true), url);
      expect(res?.status).toBe(403);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test('returns 400 when boardId is missing', () => {
    const { req, url } = wsReq('', { Cookie: `session_id=${sessionId}` });
    const res = handleWsUpgrade(req, makeMockServer(true), url);
    expect(res?.status).toBe(400);
  });

  test('returns 404 when board does not exist', () => {
    const { req, url } = wsReq('boardId=nonexistent', { Cookie: `session_id=${sessionId}` });
    const res = handleWsUpgrade(req, makeMockServer(true), url);
    expect(res?.status).toBe(404);
  });

  test('returns 403 when user is not a team member', () => {
    const outsiderId = crypto.randomUUID();
    testDb
      .prepare(
        'INSERT INTO users (id, email, password_hash, display_name, avatar_seed) VALUES (?, ?, ?, ?, ?)'
      )
      .run(outsiderId, 'outsider@example.com', 'hash', 'Outsider', 'seed2');
    const outsiderSession = crypto.randomUUID();
    testDb
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(outsiderSession, outsiderId, new Date(Date.now() + 86_400_000).toISOString());

    const { req, url } = wsReq(`boardId=${boardId}`, {
      Cookie: `session_id=${outsiderSession}`,
    });
    const res = handleWsUpgrade(req, makeMockServer(true), url);
    expect(res?.status).toBe(403);
  });

  test('returns undefined and calls server.upgrade with correct WsData on success', () => {
    const server = makeMockServer(true);
    const { req, url } = wsReq(`boardId=${boardId}`, {
      Cookie: `session_id=${sessionId}`,
    });
    const res = handleWsUpgrade(req, server, url);
    expect(res).toBeUndefined();
    expect(server.upgrade).toHaveBeenCalledTimes(1);
    const callArgs = (server.upgrade as ReturnType<typeof mock>).mock.calls[0];
    expect(callArgs?.[0]).toBe(req);
    const data = callArgs?.[1]?.data as WsData | undefined;
    expect(data?.userId).toBe(userId);
    expect(data?.boardId).toBe(boardId);
    expect(data?.displayName).toBe('WS User');
  });

  test('returns 400 when server.upgrade returns false', () => {
    const { req, url } = wsReq(`boardId=${boardId}`, {
      Cookie: `session_id=${sessionId}`,
    });
    const res = handleWsUpgrade(req, makeMockServer(false), url);
    expect(res?.status).toBe(400);
  });
});

describe('wsHandlers presence roster', () => {
  function fakeSocket(data: WsData) {
    const sent: string[] = [];
    return {
      sent,
      socket: {
        data,
        send: (msg: string) => {
          sent.push(msg);
          return 0;
        },
        subscribe: () => {},
        unsubscribe: () => {},
        close: () => {},
      } as unknown as ServerWebSocket<WsData>,
    };
  }

  function socketData(userId: string, name: string): WsData {
    return { sessionId: `sess-${userId}`, userId, displayName: name, avatarSeed: 'seed', boardId };
  }

  test('a newly opened socket receives a roster of existing viewers', () => {
    const first = fakeSocket(socketData('roster-user-1', 'First'));
    const second = fakeSocket(socketData('roster-user-2', 'Second'));
    const third = fakeSocket(socketData('roster-user-3', 'Third'));

    try {
      wsHandlers.open(first.socket);
      // First viewer gets an empty roster.
      expect(JSON.parse(first.sent[0] ?? '{}')).toMatchObject({ type: 'roster', users: [] });

      wsHandlers.open(second.socket);
      const rosterForSecond = JSON.parse(second.sent[0] ?? '{}');
      expect(rosterForSecond.type).toBe('roster');
      expect(rosterForSecond.users).toEqual([
        { userId: 'roster-user-1', name: 'First', avatarSeed: 'seed' },
      ]);

      wsHandlers.open(third.socket);
      const rosterForThird = JSON.parse(third.sent[0] ?? '{}');
      expect(rosterForThird.users).toHaveLength(2);
    } finally {
      wsHandlers.close(first.socket, 1000, '');
      wsHandlers.close(second.socket, 1000, '');
      wsHandlers.close(third.socket, 1000, '');
    }
  });
});
