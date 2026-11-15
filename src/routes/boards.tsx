import { ErrorPage } from '../components/error';
import { BoardColumns } from '../components/fragments/board-columns';
import { BoardEdit } from '../components/fragments/board-edit';
import { BoardNew } from '../components/fragments/board-new';
import { ColumnEdit } from '../components/fragments/column-edit';
import { ColumnNew } from '../components/fragments/column-new';
import { ColumnTasks } from '../components/fragments/column-tasks';
import { Layout } from '../components/layout';
import { BoardPage } from '../components/pages/board';
import { db } from '../config/database';
import { realtime } from '../realtime/realtime';
import {
  createBoardSchema,
  createColumnSchema,
  reorderColumnsSchema,
  reorderTasksSchema,
  updateBoardSchema,
  updateColumnSchema,
} from '../schemas';
import { boardService } from '../services/board.service';
import { taskService } from '../services/task.service';
import { teamService } from '../services/team.service';
import {
  errorArticleResponse,
  flashRedirect,
  parseFormData,
  requireUser,
  requireUserOrLogin,
  setFlashToast,
} from '../utils/http';
import { logError } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { validateBody } from '../utils/validation';

export async function handleBoardRoutes(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  // Board creation modal (protected, HTMX fragment)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/new$/) && method === 'GET') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];

    if (teamSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const html = await (<BoardNew teamSlug={teamSlug} />);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return new Response('Team not found', { status: 404 });
      }
    }
  }

  // Create board (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const rateLimitKey = `board-create:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response('Too many requests', { status: 429 });
    }

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];

    if (teamSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, createBoardSchema);
        if (input instanceof Response) return input;

        // Create board
        const board = await boardService.createBoard({
          teamId: team.id,
          ...input,
        });

        // Return success message that redirects to board
        return flashRedirect(
          `/teams/${team.slug}/boards/${board.slug}`,
          'success',
          'Board created',
          req
        );
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create board';
        return errorArticleResponse(errorMessage, { showBackButton: true });
      }
    }
  }

  // Board edit modal (protected, HTMX fragment)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/edit$/) && method === 'GET') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];

    if (teamSlug && boardSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const html = await (<BoardEdit teamSlug={teamSlug} board={board} />);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return new Response('Board not found', { status: 404 });
      }
    }
  }

  // Update board (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];

    if (teamSlug && boardSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, updateBoardSchema);
        if (input instanceof Response) return input;

        // Update board
        const updatedBoard = await boardService.updateBoard(board.id, input);

        // Notify other viewers of non-URL-changing updates only; if the slug
        // changed, the local user is redirected below and remote users on the
        // old URL will see a 404 on reload, so avoid a blind reload.
        if (updatedBoard.slug === board.slug) {
          realtime.broadcastRefresh(board.id, user.id);
        }

        // Redirect back to board page (use the updated slug in case it changed)
        return flashRedirect(
          `/teams/${team.slug}/boards/${updatedBoard.slug}`,
          'success',
          'Board updated',
          req
        );
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to update board';
        return flashRedirect(`/teams/${teamSlug}/boards/${boardSlug}`, 'error', errorMessage, req);
      }
    }
  }

  // Delete board (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/delete$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];

    if (teamSlug && boardSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Notify connected viewers before deleting — their refresh will hit a
        // 404 and redirect them back to the team page.
        realtime.broadcastRefresh(board.id);

        // Delete board
        boardService.deleteBoard(board.id);

        return flashRedirect(`/teams/${team.slug}`, 'success', 'Board deleted', req);
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete board';
        return flashRedirect(`/teams/${teamSlug}/boards/${boardSlug}`, 'error', errorMessage, req);
      }
    }
  }

  // Board detail page (protected)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+$/) && method === 'GET') {
    const user = requireUserOrLogin(req);
    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];

    if (teamSlug && boardSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);

        // Check if user is a member
        if (!teamService.isTeamMember(team.id, user.id)) {
          const html = await (
            <Layout title="Access Denied">
              <ErrorPage error="You do not have access to this board" />
            </Layout>
          );
          return new Response(html, {
            status: 403,
            headers: { 'Content-Type': 'text/html' },
          });
        }

        const board = boardService.getBySlug(team.id, boardSlug);
        const columns = boardService.getColumnsForBoard(board.id);
        const filterAssigned = url.searchParams.get('assignedToMe') === 'on';
        // Deep-link target: only auto-open a valid task on this board.
        const requestedTaskId = url.searchParams.get('task');
        let openTaskId: string | null = null;
        if (requestedTaskId && /^[A-Za-z0-9_-]{21}$/.test(requestedTaskId)) {
          try {
            const requestedTask = taskService.getByIdWithDetails(requestedTaskId);
            if (requestedTask.columnBoardId === board.id) openTaskId = requestedTaskId;
          } catch {
            // Ignore invalid or stale deep links and render the board normally.
          }
        }
        // Board-level task search query
        const searchQuery = url.searchParams.get('q') || '';
        const showArchived = url.searchParams.get('archived') === 'true';
        const canAdmin = teamService.isTeamAdmin(team.id, user.id);
        const archivedCount = taskService.countArchivedOnBoard(board.id);

        // HTMX partial: search/filter swaps only ask for the board's columns.
        // Returning just the children of .kanban-board keeps the board element
        // (Alpine state + delegated listeners) intact and avoids nesting.
        if (req.headers.get('HX-Request') === 'true') {
          const tasksQs = [
            filterAssigned ? 'assigned=true' : '',
            searchQuery ? `q=${encodeURIComponent(searchQuery)}` : '',
            showArchived ? 'archived=true' : '',
          ]
            .filter(Boolean)
            .join('&');
          const fragment = await (
            <BoardColumns
              boardBase={`/teams/${teamSlug}/boards/${board.slug}`}
              columns={columns}
              tasksQuery={tasksQs ? `?${tasksQs}` : ''}
              canAdmin={canAdmin}
            />
          );
          return new Response(fragment, {
            headers: { 'Content-Type': 'text/html', Vary: 'HX-Request' },
          });
        }

        const html = await (
          <Layout title={board.name} user={user} scripts={['/js/board.js']}>
            <BoardPage
              board={board}
              teamSlug={teamSlug}
              columns={columns}
              user={user}
              filterAssigned={filterAssigned}
              openTaskId={openTaskId}
              searchQuery={searchQuery}
              showArchived={showArchived}
              canAdmin={canAdmin}
              archivedCount={archivedCount}
            />
          </Layout>
        );
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Board not found';
        const html = await (
          <Layout title="Not Found">
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

  // Column tasks fragment (protected, HTMX)
  if (
    url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/columns\/[^/]+\/tasks$/) &&
    method === 'GET'
  ) {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];
    const columnId = pathParts[6];

    if (teamSlug && boardSlug && columnId) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);
        const column = boardService.getColumnById(columnId);

        // Check if user is a member
        if (!teamService.isTeamMember(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Verify column belongs to this board
        if (column.boardId !== board.id) {
          return new Response('Column not found', { status: 404 });
        }

        const assignedOnly = url.searchParams.get('assigned') === 'true';
        const showArchived = url.searchParams.get('archived') === 'true';
        const search = (url.searchParams.get('q') || '').trim();
        const searchClause = search
          ? `AND (LOWER(t.title) LIKE ? OR LOWER(COALESCE(t.description,'')) LIKE ?)`
          : '';
        const archiveClause = showArchived ? 'AND t.archived = 1' : 'AND t.archived = 0';

        // Get tasks for this column
        let tasksQuery = `
            SELECT
              t.*,
              a.id as assignee_id,
              a.display_name as assignee_name,
              a.avatar_seed as assignee_seed
            FROM tasks t
            LEFT JOIN users a ON a.id = t.assignee_id
            WHERE t.column_id = ?
              ${archiveClause}
              ${searchClause}
          `;

        const queryParams: string[] = [columnId];
        if (search) {
          const like = `%${search.toLowerCase()}%`;
          queryParams.push(like, like);
        }

        if (assignedOnly) {
          tasksQuery += ' AND t.assignee_id = ?';
          queryParams.push(user.id);
        }

        tasksQuery += ' ORDER BY t.position';

        const tasks = db.prepare(tasksQuery).all(...queryParams) as Array<Record<string, unknown>>;

        const html = await (
          <ColumnTasks
            columnId={columnId}
            tasks={tasks.map((t) => ({
              id: t.id as string,
              title: t.title as string,
              description: t.description as string | null,
              priority: t.priority as string,
              dueDate: t.due_date ? new Date(t.due_date as string) : null,
              assignee: t.assignee_id
                ? {
                    displayName: t.assignee_name as string,
                    avatarSeed: t.assignee_seed as string,
                  }
                : null,
            }))}
          />
        );
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return new Response('Column not found', { status: 404 });
      }
    }
  }

  // Column creation modal (protected, HTMX fragment)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/columns\/new$/) && method === 'GET') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];

    if (teamSlug && boardSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);
        boardService.getBySlug(team.id, boardSlug);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const html = await (<ColumnNew teamSlug={teamSlug} boardSlug={boardSlug} />);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return new Response('Board not found', { status: 404 });
      }
    }
  }

  // Create column (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/columns$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];

    if (teamSlug && boardSlug) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const board = boardService.getBySlug(team.id, boardSlug);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, createColumnSchema);
        if (input instanceof Response) return input;

        // Create column (position auto-calculated by service)
        await boardService.createColumn({
          boardId: board.id,
          ...input,
        });

        // Notify other viewers of structural change
        realtime.broadcastRefresh(board.id, user.id);

        // Return success that reloads the page
        return flashRedirect(
          `/teams/${team.slug}/boards/${board.slug}`,
          'success',
          'Column created',
          req
        );
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create column';
        return errorArticleResponse(errorMessage, { showBackButton: true });
      }
    }
  }

  // Column edit modal (protected, HTMX fragment)
  if (
    url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/columns\/[^/]+\/edit$/) &&
    method === 'GET'
  ) {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];
    const columnId = pathParts[6];

    if (teamSlug && boardSlug && columnId) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const _board = boardService.getBySlug(team.id, boardSlug);
        const column = boardService.getColumnById(columnId);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Verify column belongs to this board
        if (column.boardId !== _board.id) {
          return new Response('Column not found', { status: 404 });
        }

        const html = await (
          <ColumnEdit teamSlug={teamSlug} boardSlug={boardSlug} column={column} />
        );
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return new Response('Column not found', { status: 404 });
      }
    }
  }

  // Update column (protected, POST)
  if (url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/columns\/[^/]+$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];
    const columnId = pathParts[6];

    if (teamSlug && boardSlug && columnId) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const _board = boardService.getBySlug(team.id, boardSlug);
        const column = boardService.getColumnById(columnId);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Verify column belongs to this board
        if (column.boardId !== _board.id) {
          return new Response('Column not found', { status: 404 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, updateColumnSchema);
        if (input instanceof Response) return input;

        // Update column
        await boardService.updateColumn(columnId, input);

        // Notify other viewers of structural change
        realtime.broadcastRefresh(_board.id, user.id);

        // Return success that reloads the page
        return flashRedirect(
          `/teams/${team.slug}/boards/${_board.slug}`,
          'success',
          'Column updated',
          req
        );
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to update column';
        return errorArticleResponse(errorMessage, { showBackButton: true });
      }
    }
  }

  // Delete column (protected, POST)
  if (
    url.pathname.match(/^\/teams\/[^/]+\/boards\/[^/]+\/columns\/[^/]+\/delete$/) &&
    method === 'POST'
  ) {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const teamSlug = pathParts[2];
    const boardSlug = pathParts[4];
    const columnId = pathParts[6];

    if (teamSlug && boardSlug && columnId) {
      try {
        const team = teamService.getBySlug(teamSlug);
        const _board = boardService.getBySlug(team.id, boardSlug);
        const column = boardService.getColumnById(columnId);

        // Check if user is admin/owner
        if (!teamService.isTeamAdmin(team.id, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        // Verify column belongs to this board
        if (column.boardId !== _board.id) {
          return new Response('Column not found', { status: 404 });
        }

        // Delete column (cascade will delete tasks)
        boardService.deleteColumn(columnId);

        // Broadcast board refresh to other viewers
        realtime.broadcastRefresh(_board.id, user.id);

        // Return success that reloads the page
        return flashRedirect(
          `/teams/${team.slug}/boards/${_board.slug}`,
          'success',
          'Column deleted',
          req
        );
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete column';
        return errorArticleResponse(errorMessage, { showBackButton: true });
      }
    }
  }

  // Reorder columns (protected, POST)
  if (url.pathname.match(/^\/boards\/[^/]+\/columns\/reorder$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const boardId = pathParts[2];

    if (boardId) {
      try {
        const board = boardService.getById(boardId);

        // Check if user is admin/owner of the board's team
        if (!teamService.isTeamAdmin(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, reorderColumnsSchema);
        if (input instanceof Response) return input;

        // Reorder columns
        await boardService.reorderColumns(boardId, input.columnIds);

        // Broadcast board refresh to other viewers
        realtime.broadcastRefresh(boardId, user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to reorder columns';
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  // Reorder tasks in a column (protected, POST)
  if (url.pathname.match(/^\/columns\/[^/]+\/tasks\/reorder$/) && method === 'POST') {
    const user = requireUser(req);

    if (user instanceof Response) return user;

    const pathParts = url.pathname.split('/');
    const columnId = pathParts[2];

    if (columnId) {
      try {
        // Verify user has access to this board
        const column = boardService.getColumnById(columnId);
        const board = boardService.getById(column.boardId);
        if (!teamService.isTeamMember(board.teamId, user.id)) {
          return new Response('Access Denied', { status: 403 });
        }

        const data = await parseFormData(req);
        const input = validateBody(data, reorderTasksSchema);
        if (input instanceof Response) return input;

        // Reorder tasks in database
        await taskService.reorderTasks(columnId, input.taskIds);

        // Broadcast a board refresh to other viewers. Reordering may move tasks
        // between columns, so a full refresh is the safest way to keep everyone
        // in sync without tracking every affected column.
        realtime.broadcastRefresh(board.id, user.id);

        // Return success response with HX-Refresh to reload the board
        return new Response('', {
          headers: {
            'Content-Type': 'text/html',
            'HX-Refresh': 'true',
            'Set-Cookie': setFlashToast('success', 'Tasks reordered'),
          },
        });
      } catch (error) {
        logError('boards', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to reorder tasks';
        return new Response(errorMessage, { status: 400 });
      }
    }
  }

  return null;
}
