import type { PropsWithChildren } from '@kitajs/html';
import { alpine } from '../../utils/html';
import { BoardColumns } from '../fragments/board-columns';

interface BoardPageBoard {
  id: string;
  name: string;
  description: string | null;
  slug: string;
}

interface BoardPageColumn {
  id: string;
  name: string;
  color: string | null;
  wipLimit: number | null;
}

interface BoardPageProps {
  board: BoardPageBoard;
  teamSlug: string;
  columns: BoardPageColumn[];
  user: { id: string; avatarSeed: string; displayName: string };
  filterAssigned: boolean;
  searchQuery: string;
  showArchived: boolean;
  openTaskId: string | null;
  /** Team admin/owner — structural board/column controls */
  canAdmin?: boolean;
  archivedCount?: number;
}

export function BoardPage({
  board,
  teamSlug,
  columns,
  user,
  filterAssigned,
  searchQuery,
  showArchived,
  openTaskId,
  canAdmin = false,
  archivedCount = 0,
}: PropsWithChildren<BoardPageProps>) {
  const tasksQs = [
    filterAssigned ? 'assigned=true' : '',
    searchQuery ? `q=${encodeURIComponent(searchQuery)}` : '',
    showArchived ? 'archived=true' : '',
  ]
    .filter(Boolean)
    .join('&');
  const tasksQuery = tasksQs ? `?${tasksQs}` : '';

  const boardBase = `/teams/${teamSlug}/boards/${board.slug}`;

  return (
    <>
      {/* WebSocket wrapper — separate from Alpine x-data to avoid conflicts */}
      <div hx-ext="ws" ws-connect={`/ws/board?boardId=${board.id}`}>
        {/* Presence bar — shows who's currently viewing this board */}
        <div
          class="presence-bar"
          x-data="boardPresence"
          x-cloak
          role="status"
          aria-label="Users currently viewing this board"
          aria-live="polite"
          data-current-user-id={user.id}
        >
          <template {...alpine({ 'x-for': 'u in activeUsers', ':key': 'u.userId' })}>
            <img
              alt=""
              class="avatar-small presence-avatar"
              {...alpine({
                ':src': 'avatarUrl(u)',
                ':alt': 'u.name',
                ':title': 'u.name',
              })}
            />
          </template>
        </div>

        {/* Screen-reader-only live region for board change announcements */}
        <div
          class="sr-only"
          aria-live="polite"
          aria-atomic="true"
          x-data="boardAnnouncements"
          {...alpine({ 'x-text': 'announcement' })}
        >
          <span></span>
        </div>

        <div class="board-page">
          <header class="board-header">
            <div class="board-header-left">
              <h1 safe>{board.name}</h1>
              {board.description ? <p safe>{board.description}</p> : null}
            </div>
            <div class="board-toolbar">
              <input
                type="search"
                name="q"
                placeholder="Search tasks…"
                value={searchQuery}
                class="board-search"
                aria-label="Search tasks on this board"
                hx-get={boardBase}
                hx-target=".kanban-board"
                hx-swap="innerHTML"
                hx-trigger="input changed delay:400ms, search"
                hx-include="closest .board-toolbar"
                hx-indicator="#search-spinner"
              />
              <span id="search-spinner" class="htmx-indicator search-spinner" aria-hidden="true">
                ⏳
              </span>
              <label class="filter-toggle">
                <input
                  type="checkbox"
                  name="assignedToMe"
                  hx-get={boardBase}
                  hx-target=".kanban-board"
                  hx-swap="innerHTML"
                  hx-include="closest .board-toolbar"
                  checked={filterAssigned}
                />
                <span>My tasks</span>
              </label>
              <a
                safe
                href={`${boardBase}${showArchived ? '' : '?archived=true'}`}
                class="outline secondary board-btn"
                title="Show or hide archived tasks (recycle bin)"
              >
                {showArchived
                  ? 'Hide archived'
                  : `Archived${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
              </a>
              {canAdmin && showArchived && archivedCount > 0 && (
                <form
                  method="post"
                  hx-post={`${boardBase}/archived/purge`}
                  hx-confirm="Permanently delete ALL archived tasks on this board? This cannot be undone."
                  style="display:inline"
                >
                  <button type="submit" class="outline board-btn danger">
                    Empty archive
                  </button>
                </form>
              )}
              <button
                type="button"
                id="bulk-toggle"
                class="outline secondary board-btn"
                title="Select tasks to delete in bulk"
              >
                Select
              </button>
              {canAdmin && (
                <button
                  type="button"
                  hx-get={`${boardBase}/edit`}
                  hx-target="#modal-container"
                  class="outline secondary board-btn"
                >
                  Edit Board
                </button>
              )}
              <form
                method="post"
                id="bulk-delete-form"
                class="bulk-delete-form"
                hx-post={`/boards/${board.id}/tasks/bulk-delete`}
                hx-swap="none"
                hx-confirm="Delete all selected tasks?"
              >
                <input type="hidden" name="taskIds" id="bulk-taskIds" />
                <button type="submit" class="outline board-btn danger">
                  Delete <span id="bulk-count">0</span>
                </button>
              </form>
            </div>
          </header>

          <div
            class="kanban-board"
            data-board-id={board.id}
            data-open-task-id={openTaskId || undefined}
          >
            <BoardColumns
              boardBase={boardBase}
              columns={columns}
              tasksQuery={tasksQuery}
              canAdmin={canAdmin}
            />
          </div>
        </div>
      </div>

      <div id="modal-container"></div>
    </>
  );
}
