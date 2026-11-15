import { Layout } from '../components/layout';
import { DashboardPage } from '../components/pages/dashboard';
import { ProfilePage } from '../components/pages/profile';
import { disconnectUserConnectionsExcept } from '../realtime/handlers';
import { profileUpdateSchema } from '../schemas';
import { boardService } from '../services/board.service';
import { taskService } from '../services/task.service';
import { teamService } from '../services/team.service';
import { tokenService } from '../services/token.service';
import { userService } from '../services/user.service';
import { parseCookie } from '../utils/cookie';
import { externalOrigin } from '../utils/html';
import {
  flashRedirect,
  inlineErrorResponse,
  parseFormData,
  requireUser,
  requireUserOrLogin,
} from '../utils/http';
import { logError } from '../utils/logger';
import { renderMarkdown } from '../utils/markdown';
import { checkRateLimit } from '../utils/rate-limit';
import { validateBody } from '../utils/validation';

export async function handlePageRoutes(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  // Dashboard (protected)
  if (url.pathname === '/dashboard' && method === 'GET') {
    const user = requireUserOrLogin(req);
    if (user instanceof Response) return user;

    const teams = teamService.getTeamsForUser(user.id);
    const allBoards = boardService.getBoardsForTeamIds(teams.map((t) => t.id));
    const teamsWithBoards = teams.map((team) => ({
      ...team,
      boards: allBoards.filter((b) => b.teamId === team.id),
    }));
    const assignedTasks = taskService.getTasksAssignedToUser(user.id);

    const html = await (
      <Layout title="Dashboard" user={user}>
        <DashboardPage
          user={user}
          teams={teams}
          teamsWithBoards={teamsWithBoards}
          assignedTasks={assignedTasks}
        />
      </Layout>
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Profile settings page (protected)
  if (url.pathname === '/profile' && method === 'GET') {
    const user = requireUserOrLogin(req);
    if (user instanceof Response) return user;

    const tokens = tokenService.listForUser(user.id);
    const mcpUrl = `${externalOrigin(req)}/api/mcp`;
    const html = await (
      <Layout title="Profile Settings" user={user} scripts={['/js/forms.js']}>
        <ProfilePage user={user} tokens={tokens} mcpUrl={mcpUrl} />
      </Layout>
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Create API token (protected, POST)
  if (url.pathname === '/profile/tokens' && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    if (!checkRateLimit(`token-create:${user.id}`)) {
      return new Response('Too many attempts. Please try again later.', { status: 429 });
    }

    try {
      const data = await parseFormData(req);
      const { token } = tokenService.create(user.id, data.name || '');
      const tokens = tokenService.listForUser(user.id);
      const mcpUrl = `${externalOrigin(req)}/api/mcp`;
      // Re-render the profile page showing the new token exactly once.
      const html = await (
        <Layout title="Profile Settings" user={user} scripts={['/js/forms.js']}>
          <ProfilePage user={user} tokens={tokens} newToken={token} mcpUrl={mcpUrl} />
        </Layout>
      );
      return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
      });
    } catch (error) {
      logError('pages', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create token';
      return inlineErrorResponse(errorMessage);
    }
  }

  // Revoke API token (protected, POST)
  if (url.pathname.match(/^\/profile\/tokens\/[^/]+\/revoke$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    const tokenId = url.pathname.split('/')[3] ?? '';
    try {
      tokenService.revoke(user.id, tokenId);
    } catch (error) {
      logError('pages', error);
      return new Response('Token not found', { status: 404 });
    }
    return flashRedirect('/profile', 'success', 'Token revoked', req);
  }

  // Profile settings update (protected, POST)
  if (url.pathname === '/profile' && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    if (!checkRateLimit(`profile:${user.id}`)) {
      return new Response('Too many attempts. Please try again later.', { status: 429 });
    }

    try {
      const data = await parseFormData(req);
      const input = validateBody(data, profileUpdateSchema);
      if (input instanceof Response) return input;

      const currentSessionId = parseCookie(req.headers.get('Cookie'), 'session_id') ?? undefined;

      await userService.updateProfile(
        user.id,
        {
          displayName: input.displayName,
          email: input.email,
          password: input.password,
          currentPassword: input.currentPassword,
        },
        { currentSessionId }
      );
      if (input.password) disconnectUserConnectionsExcept(user.id, currentSessionId);

      return flashRedirect('/profile', 'success', 'Profile updated successfully!', req);
    } catch (error) {
      logError('pages', error);
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      return inlineErrorResponse(errorMessage, { style: 'margin-bottom: 1rem;' });
    }
  }

  // Markdown preview (protected, POST)
  if (url.pathname === '/markdown-preview' && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;
    if (!checkRateLimit(`markdown:${user.id}`)) {
      return new Response('Too many requests', { status: 429 });
    }
    const data = await parseFormData(req);
    const text = data.text || data.description || '';
    return new Response(renderMarkdown(text), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return null;
}
