import { handleMcpPayload } from '../mcp/server';
import { tokenService } from '../services/token.service';
import { logError } from '../utils/logger';

const MCP_MAX_BODY = 256 * 1024; // 256KB — generous for batched JSON-RPC.

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function unauthorized(message: string): Response {
  return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message } }, 401, {
    'WWW-Authenticate': 'Bearer realm="clickdown-mcp"',
  });
}

/**
 * MCP Streamable HTTP endpoint (POST /api/mcp).
 *
 * Authentication is via `Authorization: Bearer cd_...` API token (created in
 * Profile → API Tokens). Bearer tokens are not sent by browsers ambiently, so
 * CSRF Origin checks do not apply here — this route is wired in before the
 * CSRF gate in index.tsx.
 */
export async function handleMcpRoute(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  if (url.pathname !== '/api/mcp') return null;

  if (method === 'GET') {
    // SSE streams are not supported; clients must use POST request/response.
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Use POST for MCP requests' } },
      405,
      { Allow: 'POST' }
    );
  }
  if (method !== 'POST') {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Method not allowed' } },
      405,
      { Allow: 'POST' }
    );
  }

  // ─── Auth ──────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized('Missing bearer token. Create one in Profile → API Tokens.');
  }
  const user = tokenService.authenticate(authHeader.slice(7).trim());
  if (!user) return unauthorized('Invalid or revoked token');

  // ─── Body ──────────────────────────────────────────────────────────────
  const contentType = req.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Content-Type must be application/json' },
      },
      415
    );
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Failed to read request body' } },
      400
    );
  }
  if (rawBody.length > MCP_MAX_BODY) {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request body too large' } },
      413
    );
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────
  try {
    const { status, body } = await handleMcpPayload(rawBody, user);
    if (status === 202 || body === undefined) {
      return new Response(null, { status: 202 });
    }
    return json(body, status);
  } catch (error) {
    logError('mcp', error);
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } },
      500
    );
  }
}
