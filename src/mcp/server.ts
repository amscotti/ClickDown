import type { AuthUser } from '../middleware/auth';
import { dispatchTool, MCP_TOOLS } from './tools';

// ─── JSON-RPC 2.0 types ──────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcError {
  code: number;
  message: string;
}

// Standard JSON-RPC error codes + MCP-reserved range.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } satisfies JsonRpcError };
}

// ─── MCP protocol constants ──────────────────────────────────────────────────

/** Protocol versions this server understands. Newest first. */
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
const LATEST_VERSION = SUPPORTED_VERSIONS[0];

const SERVER_INFO = { name: 'clickdown', version: '1.0.0' };

const CAPABILITIES = {
  tools: { listChanged: false },
};

// ─── Message handling ────────────────────────────────────────────────────────

/**
 * Handle a single JSON-RPC message.
 * Returns a response object for requests, or null for notifications (which
 * per JSON-RPC must not be answered).
 */
async function handleMessage(msg: unknown, user: AuthUser): Promise<object | null> {
  if (typeof msg !== 'object' || msg === null) {
    return rpcError(null, INVALID_REQUEST, 'Invalid JSON-RPC message');
  }
  const req = msg as JsonRpcRequest;
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return rpcError(req.id ?? null, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
  }

  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  switch (req.method) {
    case 'initialize': {
      const requested = (req.params?.protocolVersion as string) ?? LATEST_VERSION;
      const negotiated = (SUPPORTED_VERSIONS as readonly string[]).includes(requested)
        ? requested
        : LATEST_VERSION;
      return rpcResult(id, {
        protocolVersion: negotiated,
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions:
          'ClickDown Kanban API. Use list_teams → list_boards → list_tasks to find work, ' +
          'get_task for full details, then create/update/move/comment tools to work on tasks. ' +
          'All mutations are immediately visible in the web UI.',
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
    case 'initialized':
      return null; // Notifications must not be answered.

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: MCP_TOOLS });

    case 'tools/call': {
      const name = req.params?.name;
      if (typeof name !== 'string' || !name) {
        return rpcError(id, INVALID_PARAMS, 'tools/call requires a "name" parameter');
      }
      const toolArgs = (req.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await dispatchTool(name, toolArgs, user);
      return rpcResult(id, result);
    }

    // Capability lists this server does not implement — return empty rather
    // than an error so clients that probe all capabilities stay quiet.
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });

    default:
      if (isNotification) return null;
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
  }
}

/**
 * Handle a raw HTTP request body (single JSON-RPC message or a batch array).
 *
 * Returns `{ status, body }` where body is undefined for the 202 notification
 * case. Parse errors produce a single JSON-RPC error response per spec.
 */
export async function handleMcpPayload(
  rawBody: string,
  user: AuthUser
): Promise<{ status: number; body?: unknown }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: rpcError(null, PARSE_ERROR, 'Parse error') };
  }

  // Batch requests: process each message; answers are collected in order.
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { status: 400, body: rpcError(null, INVALID_REQUEST, 'Empty batch') };
    }
    const responses: object[] = [];
    for (const msg of parsed) {
      const res = await handleMessage(msg, user);
      if (res !== null) responses.push(res);
    }
    // All notifications → 202 Accepted with no body.
    if (responses.length === 0) return { status: 202 };
    return { status: 200, body: responses };
  }

  const res = await handleMessage(parsed, user);
  if (res === null) return { status: 202 }; // Notification.
  return { status: 200, body: res };
}
