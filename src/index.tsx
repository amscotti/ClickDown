import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'bun';
import { serve } from 'bun';
import { ErrorPage } from './components/error';
import { Layout } from './components/layout';
import { db } from './config/database';
import { latestMigrationFile, runMigrations } from './config/migrations';
import {
  closeAllSockets,
  handleWsUpgrade,
  sweepUnauthorizedSockets,
  wsHandlers,
} from './realtime/handlers';
import { realtime, type WsData } from './realtime/realtime';
import { handleAuthRoutes } from './routes/auth';
import { handleBoardRoutes } from './routes/boards';
import { handleChecklistRoutes } from './routes/checklist';
import { handleExtraRoutes } from './routes/extras';
import { handleMcpRoute } from './routes/mcp';
import { handlePageRoutes } from './routes/pages';
import { handleTaskRoutes } from './routes/tasks';
import { handleTeamRoutes } from './routes/teams';
import { ensureUploadDir } from './services/attachment.service';
import { externalOrigin, resolvePublicPath, withSecurityHeaders } from './utils/html';
import { serveAvatar } from './utils/http';
import { logError, logInfo } from './utils/logger';
import { resetRateLimit } from './utils/rate-limit';

export { resetRateLimit };

function secured(res: Response): Response {
  // Clone with security headers; preserve body/status/existing headers
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: withSecurityHeaders(res.headers),
  });
}

export async function handleRequest(
  req: Request,
  server?: Server<WsData>
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const method = req.method;

  // WebSocket upgrade — checked before CSRF/auth (has its own auth + Origin check)
  // Successful upgrade returns undefined; Bun then sends the 101 response.
  if (url.pathname === '/ws/board' && server) {
    return handleWsUpgrade(req, server, url);
  }

  // MCP endpoint — bearer-token auth, checked before the CSRF gate. Browsers
  // never send Authorization headers ambiently, so Origin checks don't apply.
  if (url.pathname === '/api/mcp') {
    const mcpRes = await handleMcpRoute(req, url, method);
    if (mcpRes) return secured(mcpRes);
  }

  // CSRF protection for mutating requests.
  // Always reject mismatched Origin. In production also require Origin or Referer
  // so non-browser clients cannot skip the check by omitting headers.
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = req.headers.get('Origin');
    const referer = req.headers.get('Referer');
    const isProduction = process.env.NODE_ENV === 'production';
    const allowedOrigin = externalOrigin(req);

    if (origin) {
      if (origin !== allowedOrigin) {
        return secured(new Response('Cross-site requests are not allowed', { status: 403 }));
      }
    } else if (referer) {
      try {
        if (new URL(referer).origin !== allowedOrigin) {
          return secured(new Response('Cross-site requests are not allowed', { status: 403 }));
        }
      } catch {
        return secured(new Response('Invalid Referer', { status: 403 }));
      }
    } else if (isProduction) {
      return secured(new Response('Missing Origin header', { status: 403 }));
    }
  }

  // Health / readiness (no auth) — for Docker/local probes
  if (url.pathname === '/health' && method === 'GET') {
    return secured(
      new Response(JSON.stringify({ status: 'ok', uptime: process.uptime() }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  if (url.pathname === '/ready' && method === 'GET') {
    try {
      db.prepare('SELECT 1').get();
      const latestName = latestMigrationFile();
      if (!latestName) throw new Error('No migrations found');
      const latest = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(latestName);
      if (!latest) throw new Error('Database migrations are incomplete');
      accessSync(ensureUploadDir(), constants.W_OK);
      return secured(
        new Response(JSON.stringify({ status: 'ready' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch {
      return secured(
        new Response(JSON.stringify({ status: 'not_ready' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  }

  // Static file serving (path-traversal safe)
  const vendorAssets: Record<string, { path: string; type: string }> = {
    '/vendor/pico.min.css': {
      path: join(process.cwd(), 'node_modules', '@picocss', 'pico', 'css', 'pico.min.css'),
      type: 'text/css; charset=utf-8',
    },
    '/vendor/htmx.min.js': {
      path: join(process.cwd(), 'node_modules', 'htmx.org', 'dist', 'htmx.min.js'),
      type: 'application/javascript; charset=utf-8',
    },
    '/vendor/htmx-ws.min.js': {
      path: join(process.cwd(), 'node_modules', 'htmx-ext-ws', 'dist', 'ws.min.js'),
      type: 'application/javascript; charset=utf-8',
    },
    '/vendor/alpine.min.js': {
      path: join(process.cwd(), 'node_modules', 'alpinejs', 'dist', 'cdn.min.js'),
      type: 'application/javascript; charset=utf-8',
    },
  };
  const vendorAsset = vendorAssets[url.pathname];
  if (vendorAsset && method === 'GET') {
    const file = Bun.file(vendorAsset.path);
    if (!(await file.exists())) return secured(new Response('Not found', { status: 404 }));
    return secured(
      new Response(file, {
        headers: {
          'Content-Type': vendorAsset.type,
          'Cache-Control': 'public, max-age=86400',
        },
      })
    );
  }

  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname === '/favicon.svg'
  ) {
    const publicDir = join(process.cwd(), 'public');
    const filePath = resolvePublicPath(url.pathname, publicDir);
    if (!filePath) {
      return secured(new Response('Not found', { status: 404 }));
    }
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return secured(new Response('Not found', { status: 404 }));
    }
    // Set Content-Type explicitly: re-wrapping Bun.file Responses can drop the
    // inferred type, which breaks browsers (empty MIME → CSS/JS refused).
    const type = url.pathname.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : url.pathname.endsWith('.js')
        ? 'application/javascript; charset=utf-8'
        : url.pathname.endsWith('.svg')
          ? 'image/svg+xml'
          : file.type || 'application/octet-stream';
    return secured(
      new Response(file, {
        headers: { 'Content-Type': type },
      })
    );
  }

  // API avatar endpoint
  if (url.pathname.startsWith('/api/avatar/')) {
    return secured(serveAvatar(url));
  }

  // Route groups — order matters (first match wins)
  const handlers = [
    handleAuthRoutes,
    handlePageRoutes,
    handleTeamRoutes,
    handleBoardRoutes,
    handleTaskRoutes,
    handleChecklistRoutes,
    handleExtraRoutes,
  ];

  for (const handler of handlers) {
    const res = await handler(req, url, method);
    if (res) return secured(res);
  }

  // 404
  const html = await (
    <Layout title="Not Found">
      <ErrorPage error="Page not found" />
    </Layout>
  );
  return secured(
    new Response(html, {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
  );
}

// Start the HTTP server only when run directly (not when imported by tests).
if (import.meta.main) {
  runMigrations(db);
  const server = serve<WsData>({
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    maxRequestBodySize: 12 * 1024 * 1024,
    fetch: async (req, srv) => {
      try {
        return await handleRequest(req, srv);
      } catch (error) {
        logError('http', error, { method: req.method, path: new URL(req.url).pathname });
        const html = await (
          <Layout title="Server Error">
            <ErrorPage error="An unexpected error occurred" />
          </Layout>
        );
        return secured(
          new Response(html, {
            status: 500,
            headers: { 'Content-Type': 'text/html' },
          })
        );
      }
    },
    websocket: wsHandlers,
    development: process.env.NODE_ENV !== 'production',
  });

  realtime.init(server);
  const sweepInterval = setInterval(sweepUnauthorizedSockets, 60_000);
  sweepInterval.unref();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logInfo('server', `Received ${signal}, shutting down gracefully`);
    clearInterval(sweepInterval);
    closeAllSockets();
    server.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logInfo('server', `Server running at http://localhost:${server.port}`, {
    port: server.port,
    env: process.env.NODE_ENV || 'development',
  });
}
