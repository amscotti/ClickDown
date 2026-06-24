import type { Server, ServerWebSocket } from 'bun';
import { db } from '../config/database';
import { getSessionFromRequest } from '../middleware/auth';
import { boardService } from '../services/board.service';
import { teamService } from '../services/team.service';
import { parseCookie } from '../utils/cookie';
import { externalOrigin } from '../utils/html';
import { realtime, type WsData, type WsEvent } from './realtime';

const activeSockets = new Set<ServerWebSocket<WsData>>();

export function closeAllSockets(code = 1001, reason = 'Server shutting down'): void {
  for (const ws of activeSockets) {
    ws.close(code, reason);
  }
  activeSockets.clear();
}

export function disconnectSessionConnections(sessionId: string): void {
  for (const ws of activeSockets) {
    if (ws.data.sessionId === sessionId) ws.close(1008, 'Session ended');
  }
}

export function disconnectUserConnectionsExcept(userId: string, sessionId?: string): void {
  for (const ws of activeSockets) {
    if (ws.data.userId === userId && ws.data.sessionId !== sessionId) {
      ws.close(1008, 'Session revoked');
    }
  }
}

export function disconnectUserFromTeam(userId: string, teamId: string): void {
  for (const ws of activeSockets) {
    if (ws.data.userId !== userId) continue;
    try {
      if (boardService.getById(ws.data.boardId).teamId === teamId) {
        ws.close(1008, 'Team access revoked');
      }
    } catch {
      ws.close(1008, 'Board unavailable');
    }
  }
}

export function sweepUnauthorizedSockets(): void {
  for (const ws of activeSockets) {
    const session = db
      .prepare("SELECT 1 FROM sessions WHERE id = ? AND datetime(expires_at) > datetime('now')")
      .get(ws.data.sessionId);
    if (!session) {
      ws.close(1008, 'Session expired');
      continue;
    }
    try {
      const board = boardService.getById(ws.data.boardId);
      if (!teamService.isTeamMember(board.teamId, ws.data.userId)) {
        ws.close(1008, 'Team access revoked');
      }
    } catch {
      ws.close(1008, 'Board unavailable');
    }
  }
}

export function handleWsUpgrade(
  req: Request,
  server: Server<WsData>,
  url: URL
): Response | undefined {
  const user = getSessionFromRequest(req);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const sessionId = parseCookie(req.headers.get('Cookie'), 'session_id');
  if (!sessionId) return new Response('Unauthorized', { status: 401 });

  // CSRF defense: validate the Origin header. Browsers always send Origin on
  // WebSocket handshakes, so in production we require it (rejecting absent
  // Origin). In dev/E2E the header is optional so non-browser clients and some
  // test runners can connect without it.
  const isProduction = process.env.NODE_ENV === 'production';
  const origin = req.headers.get('Origin');
  if (!origin) {
    if (isProduction) return new Response('Missing Origin header', { status: 403 });
  } else if (origin !== externalOrigin(req)) {
    return new Response('Cross-origin WebSocket not allowed', { status: 403 });
  }

  const boardId = url.searchParams.get('boardId');
  if (!boardId) return new Response('boardId required', { status: 400 });

  let board: { teamId: string };
  try {
    board = boardService.getById(boardId);
  } catch {
    return new Response('Board not found', { status: 404 });
  }

  if (!teamService.isTeamMember(board.teamId, user.id)) {
    return new Response('Forbidden', { status: 403 });
  }

  const ok = server.upgrade(req, {
    data: {
      sessionId,
      userId: user.id,
      displayName: user.displayName,
      avatarSeed: user.avatarSeed,
      boardId,
    },
  });

  return ok ? undefined : new Response('Upgrade failed', { status: 400 });
}

export const wsHandlers = {
  idleTimeout: 120,
  maxPayloadLength: 256 * 1024,
  sendPings: true,

  open(ws: ServerWebSocket<WsData>) {
    activeSockets.add(ws);
    const topic = `board:${ws.data.boardId}`;
    ws.subscribe(topic);

    // Send the newcomer a roster of viewers already connected, so presence is
    // symmetric instead of only showing people who join after you.
    const roster: WsEvent = {
      type: 'roster',
      users: [...activeSockets]
        .filter((other) => other !== ws && other.data.boardId === ws.data.boardId)
        .map((other) => ({
          userId: other.data.userId,
          name: other.data.displayName,
          avatarSeed: other.data.avatarSeed,
        })),
    };
    ws.send(JSON.stringify(roster));

    const event: WsEvent = {
      type: 'presence',
      userId: ws.data.userId,
      name: ws.data.displayName,
      avatarSeed: ws.data.avatarSeed,
    };
    realtime.broadcastEvent(ws.data.boardId, event);
  },

  close(ws: ServerWebSocket<WsData>, _code: number, _reason: string) {
    activeSockets.delete(ws);
    const topic = `board:${ws.data.boardId}`;
    ws.unsubscribe(topic);

    const event: WsEvent = {
      type: 'absence',
      userId: ws.data.userId,
    };
    realtime.broadcastEvent(ws.data.boardId, event);
  },

  message(_ws: ServerWebSocket<WsData>, _message: string | Buffer) {
    // No-op: mutations go through HTTP, not WebSocket.
  },
};
