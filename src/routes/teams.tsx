import { ErrorPage } from '../components/error';
import { TeamEdit } from '../components/fragments/team-edit';
import { TeamInvite } from '../components/fragments/team-invite';
import { TeamJoinModal } from '../components/fragments/team-join-modal';
import { TeamList } from '../components/fragments/team-list';
import { TeamNew } from '../components/fragments/team-new';
import { Layout } from '../components/layout';
import { TeamPage, type TeamPageBoard } from '../components/pages/team';
import { TeamJoinPage } from '../components/pages/team-join';
import { db } from '../config/database';
import { getSessionFromRequest } from '../middleware/auth';
import { TeamRole } from '../models/team.model';
import { disconnectUserFromTeam } from '../realtime/handlers';
import { createTeamSchema, joinTeamSchema, roleChangeSchema, updateTeamSchema } from '../schemas';
import { teamService } from '../services/team.service';
import { accessTeamAdmin, accessTeamMember } from '../utils/access';
import { externalOrigin } from '../utils/html';
import {
  clientIp,
  errorArticleResponse,
  flashRedirect,
  inlineErrorResponse,
  parseFormData,
  requireUser,
  requireUserOrLogin,
} from '../utils/http';
import { logError } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { validateBody } from '../utils/validation';

export async function handleTeamRoutes(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  // Team creation modal (protected, HTMX fragment)
  if (url.pathname === '/teams/new' && method === 'GET') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const html = await (<TeamNew />);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Team list fragment (protected, HTMX)
  if (url.pathname === '/teams/list' && method === 'GET') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const teams = teamService.getTeamsForUser(user.id);
    const html = await (<TeamList teams={teams} />);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Team join modal (protected, HTMX fragment)
  if (url.pathname === '/teams/join-modal' && method === 'GET') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const html = await (<TeamJoinModal />);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Team join via invite link (protected, POST) — requires slug + secret token
  if (url.pathname === '/teams/join' && method === 'POST') {
    if (!checkRateLimit(`team-join:${clientIp(req)}`)) {
      return new Response('Too many attempts. Please try again later.', { status: 429 });
    }
    const user = requireUser(req);

    if (user instanceof Response) return user;

    try {
      const data = await parseFormData(req);
      const input = validateBody(data, joinTeamSchema);
      if (input instanceof Response) return input;
      const slug = input.teamSlug;
      const token = input.inviteToken;

      const team = teamService.getBySlug(slug);

      if (!teamService.validateInviteToken(team.id, token)) {
        return inlineErrorResponse('Invalid or expired invite link', { status: 403 });
      }

      // Check if already a member
      if (teamService.isTeamMember(team.id, user.id)) {
        return inlineErrorResponse('You are already a member of this team');
      }

      // Add user as member
      teamService.addMember(team.id, user.id, TeamRole.Member);

      // Check if this is an HTMX request
      const isHtmx = req.headers.get('HX-Request') === 'true';

      if (isHtmx) {
        // For HTMX, use HX-Redirect to navigate to team
        return new Response('', {
          status: 200,
          headers: {
            'HX-Redirect': `/teams/${team.slug}`,
          },
        });
      }

      // For non-HTMX requests, use standard redirect
      return new Response('', {
        status: 302,
        headers: {
          Location: `/teams/${team.slug}`,
        },
      });
    } catch (error) {
      logError('teams', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to join team';
      return inlineErrorResponse(errorMessage);
    }
  }

  // Team invite modal (protected, HTMX fragment)
  if (url.pathname.match(/^\/teams\/[^/]+\/invite$/) && method === 'GET') {
    const user = requireUser(req);
    if (user instanceof Response) return user;

    const teamSlug = url.pathname.split('/')[2];
    if (!teamSlug) return null;

    const access = accessTeamMember(teamSlug, user);
    if (access instanceof Response) return access;
    const { team } = access;

    // Invite link includes a secret token (not guessable from the slug alone)
    const token = teamService.getOrCreateInviteToken(team.id);
    const inviteLink = `${externalOrigin(req)}/teams/${team.slug}/join?token=${encodeURIComponent(token)}`;

    const html = await (
      <TeamInvite
        team={team}
        inviteLink={inviteLink}
        canRegenerate={teamService.isTeamAdmin(team.id, user.id)}
      />
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Team join page (public, but requires login + valid invite token)
  if (url.pathname.match(/^\/teams\/[^/]+\/join$/) && method === 'GET') {
    const user = getSessionFromRequest(req);

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const token = url.searchParams.get('token');

    if (teamSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);

        if (!teamService.validateInviteToken(team.id, token)) {
          const html = await (
            <Layout title="Invalid Invite">
              <ErrorPage error="Invalid or expired invite link" />
            </Layout>
          );
          return new Response(html, {
            status: 403,
            headers: { 'Content-Type': 'text/html' },
          });
        }

        if (!user) {
          // Preserve token in the return URL after login
          const returnPath = `${url.pathname}?token=${encodeURIComponent(token ?? '')}`;
          return new Response('', {
            status: 302,
            headers: {
              Location: `/login?redirect=${encodeURIComponent(returnPath)}`,
            },
          });
        }

        // Check if already a member
        if (teamService.isTeamMember(team.id, user.id)) {
          // Already a member, redirect to team page
          return new Response('', {
            status: 302,
            headers: { Location: `/teams/${team.slug}` },
          });
        }

        // Show join confirmation page
        const html = await (
          <Layout title="Join Team" user={user}>
            <TeamJoinPage team={team} inviteToken={token ?? ''} />
          </Layout>
        );
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        const html = await (
          <Layout title="Not Found">
            <ErrorPage error="Team not found" />
          </Layout>
        );
        return new Response(html, {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }
  }

  // Team join action (protected, POST) — form on join page
  if (url.pathname.match(/^\/teams\/[^/]+\/join$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    if (!checkRateLimit(`team-join:${clientIp(req)}`)) {
      return new Response('Too many attempts. Please try again later.', { status: 429 });
    }

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];

    if (teamSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const data = await parseFormData(req);
        const token = data.inviteToken || url.searchParams.get('token') || '';

        if (!teamService.validateInviteToken(team.id, token)) {
          const html = await (
            <Layout title="Invalid Invite">
              <ErrorPage error="Invalid or expired invite link" />
            </Layout>
          );
          return new Response(html, {
            status: 403,
            headers: { 'Content-Type': 'text/html' },
          });
        }

        // Check if already a member
        if (teamService.isTeamMember(team.id, user.id)) {
          return new Response('', {
            status: 302,
            headers: { Location: `/teams/${team.slug}` },
          });
        }

        // Add user as member
        teamService.addMember(team.id, user.id, TeamRole.Member);

        // Redirect to team page
        return new Response('', {
          status: 302,
          headers: { Location: `/teams/${team.slug}` },
        });
      } catch (error) {
        logError('teams', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to join team';
        const html = await (
          <Layout title="Error">
            <ErrorPage error={errorMessage} />
          </Layout>
        );
        return new Response(html, {
          status: 400,
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }
  }

  // Leave team (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/leave$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;

    const teamSlug = url.pathname.split('/')[2];
    if (!teamSlug) return null;

    const access = accessTeamMember(teamSlug, user);
    if (access instanceof Response) return access;
    const { team } = access;

    // Prevent owner from leaving (must transfer or delete)
    if (team.ownerId === user.id) {
      return new Response('Team owners cannot leave. Transfer ownership or delete the team.', {
        status: 400,
      });
    }

    try {
      teamService.removeMember(team.id, user.id);
      return flashRedirect('/dashboard', 'info', 'You left the team', req);
    } catch (error) {
      logError('teams', error);
      const msg = error instanceof Error ? error.message : 'Failed to leave team';
      return flashRedirect(`/teams/${teamSlug}`, 'error', msg, req);
    }
  }

  // Create team (protected, POST)
  if (url.pathname === '/teams' && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const rateLimitKey = `team-create:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }

    try {
      const data = await parseFormData(req);
      const input = validateBody(data, createTeamSchema);
      if (input instanceof Response) return input;

      // Create team
      const team = await teamService.createTeam({ ...input, ownerId: user.id });

      // Return success message that redirects to team
      return flashRedirect(`/teams/${team.slug}`, 'success', 'Team created', req);
    } catch (error) {
      logError('teams', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create team';
      return errorArticleResponse(errorMessage, { showBackButton: true });
    }
  }

  // Team edit modal (protected, admin-only, HTMX fragment)
  if (url.pathname.match(/^\/teams\/[^/]+\/edit$/) && method === 'GET') {
    const user = requireUser(req);
    if (user instanceof Response) return user;

    const teamSlug = url.pathname.split('/')[2];
    if (!teamSlug) return null;

    const access = accessTeamAdmin(teamSlug, user);
    if (access instanceof Response) return access;

    const { team } = access;
    const isOwner = team.ownerId === user.id;
    const html = await (<TeamEdit team={team} isOwner={isOwner} />);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Update team (protected, admin-only, POST)
  if (url.pathname.match(/^\/teams\/[^/]+$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;

    const rateLimitKey = `team-update:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }

    const teamSlug = url.pathname.split('/')[2];
    if (!teamSlug) return null;

    const access = accessTeamAdmin(teamSlug, user);
    if (access instanceof Response) return access;
    const { team } = access;

    try {
      const data = await parseFormData(req);
      const input = validateBody(data, updateTeamSchema);
      if (input instanceof Response) return input;

      // Update team
      const updatedTeam = await teamService.updateTeam(team.id, input);

      // Return success script that redirects to new team URL
      return flashRedirect(`/teams/${updatedTeam.slug}`, 'success', 'Team updated', req);
    } catch (error) {
      logError('teams', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update team';
      return errorArticleResponse(errorMessage);
    }
  }

  // Delete team (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/delete$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const rateLimitKey = `team-delete:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];

    if (teamSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);

        // Check if user is the owner
        if (!teamService.isTeamOwner(team.id, user.id)) {
          return new Response('Access Denied: Only the team owner can delete the team', {
            status: 403,
          });
        }

        // Delete team
        teamService.deleteTeam(team.id);

        // Return success script that redirects to dashboard
        return flashRedirect('/dashboard', 'success', 'Team deleted', req);
      } catch (error) {
        logError('teams', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete team';
        return errorArticleResponse(errorMessage);
      }
    }
  }

  // Update member role (protected, POST — owner only)
  if (url.pathname.match(/^\/teams\/[^/]+\/members\/[^/]+\/role$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const targetUserId = pathParts[4];
    if (!teamSlug || !targetUserId) return new Response('Bad request', { status: 400 });

    try {
      const team = teamService.getBySlug(teamSlug);
      if (!teamService.isTeamOwner(team.id, user.id)) {
        return new Response('Access Denied: only the team owner can change roles', {
          status: 403,
        });
      }
      // Prevent the owner from demoting/removing their own owner role (lockout)
      if (targetUserId === user.id) {
        return new Response('You cannot change your own owner role', { status: 400 });
      }

      const data = await parseFormData(req);
      const input = validateBody(data, roleChangeSchema);
      if (input instanceof Response) return input;
      teamService.updateMemberRole(team.id, targetUserId, input.role);
      return flashRedirect(`/teams/${team.slug}`, 'success', 'Member role updated', req);
    } catch (error) {
      logError('teams', error);
      const msg = error instanceof Error ? error.message : 'Failed to update role';
      return flashRedirect(`/teams/${teamSlug}`, 'error', msg, req);
    }
  }

  // Remove member (protected, POST — owner only)
  if (url.pathname.match(/^\/teams\/[^/]+\/members\/[^/]+\/remove$/) && method === 'POST') {
    const user = requireUser(req);
    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const targetUserId = pathParts[4];
    if (!teamSlug || !targetUserId) return new Response('Bad request', { status: 400 });

    try {
      const team = teamService.getBySlug(teamSlug);
      if (!teamService.isTeamOwner(team.id, user.id)) {
        return new Response('Access Denied: only the team owner can remove members', {
          status: 403,
        });
      }
      if (targetUserId === user.id) {
        return new Response('You cannot remove yourself. Transfer ownership instead.', {
          status: 400,
        });
      }
      teamService.removeMember(team.id, targetUserId);
      disconnectUserFromTeam(targetUserId, team.id);
      return flashRedirect(`/teams/${team.slug}`, 'success', 'Member removed', req);
    } catch (error) {
      logError('teams', error);
      const msg = error instanceof Error ? error.message : 'Failed to remove member';
      return flashRedirect(`/teams/${teamSlug}`, 'error', msg, req);
    }
  }

  // Team detail page (protected)
  if (url.pathname.startsWith('/teams/') && method === 'GET') {
    const user = requireUserOrLogin(req);
    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];

    // Check if this is a team detail page (not /teams/xxx/boards/yyy)
    if (pathParts.length === 3 && teamSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);

        // Check if user is a member
        if (!teamService.isTeamMember(team.id, user.id)) {
          const html = await (
            <Layout title="Access Denied" user={user}>
              <ErrorPage error="You do not have access to this team" />
            </Layout>
          );
          return new Response(html, {
            status: 403,
            headers: { 'Content-Type': 'text/html' },
          });
        }

        // Get team members
        const members = teamService.getTeamMembers(team.id);

        // Get boards for this team
        const boards = (db
          .prepare(
            `
                SELECT
                  b.*,
                  COUNT(c.id) as columnCount
                FROM boards b
                LEFT JOIN columns c ON c.board_id = b.id
                WHERE b.team_id = ?
                GROUP BY b.id
                ORDER BY b.name
              `
          )
          .all(team.id) || []) as TeamPageBoard[];

        const memberCount = { count: members.length };

        const html = await (
          <Layout title={team.name} user={user}>
            <TeamPage
              team={team}
              members={members}
              boards={boards}
              memberCount={memberCount.count}
              boardCount={boards.length}
              isOwner={teamService.isTeamOwner(team.id, user.id)}
              canAdmin={teamService.isTeamAdmin(team.id, user.id)}
            />
          </Layout>
        );
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch (error) {
        logError('teams', error);
        const errorMessage = error instanceof Error ? error.message : 'Team not found';
        const html = await (
          <Layout title="Not Found" user={user}>
            <ErrorPage error={errorMessage} />
          </Layout>
        );
        return new Response(html, {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }
  }

  return null;
}
