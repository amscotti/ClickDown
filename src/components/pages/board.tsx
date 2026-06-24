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
          x-data="boardPresence()"
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
                ':src': "'/api/avatar/' + u.avatarSeed + '?name=' + encodeURIComponent(u.name)",
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
          x-data="boardAnnouncements()"
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

          <div class="kanban-board" x-data="kanbanBoard()" data-board-id={board.id}>
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

      {openTaskId ? (
        <script data-open-task-id={openTaskId}>{`
          // Auto-open a deep-linked task's detail modal (e.g. from a shared /tasks/:id link),
          // then strip the ?task= param from the URL. Without this, any page reload (e.g.
          // from dragging a task, which triggers HX-Refresh) would re-open the modal.
          var taskScript = document.currentScript;
          document.addEventListener('DOMContentLoaded', function () {
            var openTaskId = taskScript && taskScript.dataset.openTaskId;
            if (typeof htmx !== 'undefined') {
              htmx.ajax('GET', '/tasks/' + encodeURIComponent(openTaskId), { target: '#modal-container' });
            }
            var u = new URL(window.location.href);
            u.searchParams.delete('task');
            window.history.replaceState(null, '', u.pathname + u.search + u.hash);
          });
        `}</script>
      ) : null}

      <script>{`
        function kanbanBoard() {
          return {
            draggedTask: null,
            draggedElement: null,
            draggedColumn: null,

            init() {
              window.handleDragStart = (e, id) => this.handleDragStart(e, id);
              window.handleDragEnd = (e) => this.handleDragEnd(e);
            },

            handleDragStart(event, taskId) {
              this.draggedTask = taskId;
              this.draggedElement = event.target;
              window.isDragging = true;
              event.target.classList.add('dragging');
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', taskId);
              event.dataTransfer.setData('drag-type', 'task');
            },

            handleDragEnd(event) {
              event.target.classList.remove('dragging');
              this.draggedTask = null;
              this.draggedElement = null;
              setTimeout(() => {
                window.isDragging = false;
              }, 100);

              // Remove all drag-over states
              document.querySelectorAll('.drag-over').forEach(el => {
                el.classList.remove('drag-over');
              });
            },

            handleDragOver(event) {
              event.preventDefault();
              event.currentTarget.classList.add('drag-over');
            },

            handleDragLeave(event) {
              event.currentTarget.classList.remove('drag-over');
            },

            // Column drag and drop
            handleColumnDragStart(event, columnId) {
              this.draggedColumn = columnId;
              event.target.closest('.kanban-column').classList.add('column-dragging');
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', columnId);
              event.dataTransfer.setData('drag-type', 'column');
            },

            handleColumnDragEnd(event) {
              event.target.closest('.kanban-column').classList.remove('column-dragging');
              this.draggedColumn = null;

              // Remove all drag-over states
              document.querySelectorAll('.kanban-column').forEach(el => {
                el.classList.remove('column-drag-over');
              });
            },

            handleColumnDragOver(event) {
              event.preventDefault();
              event.currentTarget.classList.add('column-drag-over');
            },

            handleColumnDragLeave(event) {
              event.currentTarget.classList.remove('column-drag-over');
            },

            async handleColumnDrop(event) {
              event.preventDefault();
              event.currentTarget.classList.remove('column-drag-over');

              const draggedColumnId = event.dataTransfer.getData('text/plain');
              const dragType = event.dataTransfer.getData('drag-type');
              const targetColumn = event.currentTarget;

              if (!draggedColumnId || dragType !== 'column') return;

              // Get all columns in order
              const columns = Array.from(document.querySelectorAll('.kanban-column'));
              const columnIds = columns.map(col => col.dataset.columnId);

              // Remove the dragged column from its old position
              const oldIndex = columnIds.indexOf(draggedColumnId);
              if (oldIndex > -1) {
                columnIds.splice(oldIndex, 1);
              }

              // Insert at new position
              const newIndex = columns.indexOf(targetColumn);
              columnIds.splice(newIndex, 0, draggedColumnId);

              // Send reorder request to server
              const boardEl = targetColumn.closest('.kanban-board');
              const boardId = boardEl?.dataset.boardId;
              if (!boardId) return;
              const formData = new FormData();
              formData.append('columnIds', columnIds.join(','));

              const reorderRes = await fetch(\`/boards/\${boardId}/columns/reorder\`, {
                method: 'POST',
                body: formData
              });
              if (reorderRes.ok) {
                try {
                  const addButton = boardEl.querySelector('.add-column-btn');
                  columnIds.forEach((id) => {
                    const column = boardEl.querySelector(\`.kanban-column[data-column-id="\${id}"]\`);
                    if (column) boardEl.insertBefore(column, addButton || null);
                  });
                } catch {
                  // DOM and server disagree — resync from the server.
                  window.location.reload();
                }
              } else {
                window.location.reload();
              }
            }
          };
        }

        function boardPresence() {
          return {
            activeUsers: [],
            connectionCounts: {},

            init() {
              const wsWrapper = this.$el.closest('[ws-connect]') || document.body;
              const currentUserId = this.$el.dataset.currentUserId;
              this.onWsMessage = (e) => {
                const msg = e.detail.message;
                if (typeof msg !== 'string') return;
                const trimmed = msg.trimStart();
                if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return;
                e.preventDefault();
                try {
                  const data = JSON.parse(msg);
                  if (data.type === 'presence') {
                    if (data.userId === currentUserId) return;
                    this.connectionCounts[data.userId] = (this.connectionCounts[data.userId] || 0) + 1;
                    if (!this.activeUsers.find(u => u.userId === data.userId)) {
                      this.activeUsers.push({
                        userId: data.userId,
                        name: data.name,
                        avatarSeed: data.avatarSeed,
                      });
                    }
                  } else if (data.type === 'roster') {
                    // Snapshot of viewers already connected when we joined.
                    for (const u of data.users || []) {
                      if (u.userId === currentUserId) continue;
                      this.connectionCounts[u.userId] = (this.connectionCounts[u.userId] || 0) + 1;
                      if (!this.activeUsers.find(x => x.userId === u.userId)) {
                        this.activeUsers.push(u);
                      }
                    }
                  } else if (data.type === 'absence') {
                    this.connectionCounts[data.userId] = Math.max(0, (this.connectionCounts[data.userId] || 0) - 1);
                    if (this.connectionCounts[data.userId] === 0) {
                      this.activeUsers = this.activeUsers.filter(u => u.userId !== data.userId);
                      delete this.connectionCounts[data.userId];
                    }
                  } else if (data.type === 'board-refresh') {
                    // Ignore refresh events triggered by the current user; their own
                    // HTTP request/redirect already updates the view.
                    if (data.triggeredBy && data.triggeredBy === currentUserId) return;
                    // Never reload while a dialog is open — unsaved inline edits
                    // would be lost. Queue the refresh for when it closes.
                    if (document.querySelector('dialog[open]')) {
                      if (!document.body.dataset.boardRefreshPending) {
                        document.body.dataset.boardRefreshPending = '1';
                        window.dispatchEvent(new CustomEvent('show-toast', {
                          detail: {
                            type: 'info',
                            message: 'This board changed elsewhere — it will refresh when you close this dialog.'
                          }
                        }));
                      }
                      return;
                    }
                    if (window.isDragging) return; // Don't reload during active drag
                    window.reloadBoardPreservingFilters();
                  }
                } catch {}
              };
              wsWrapper.addEventListener('htmx:wsBeforeMessage', this.onWsMessage);
            },

            destroy() {
              const wsWrapper = this.$el.closest('[ws-connect]') || document.body;
              wsWrapper.removeEventListener('htmx:wsBeforeMessage', this.onWsMessage);
            },
          };
        }

        // Reload the board, keeping the viewer's current search/filter state.
        window.reloadBoardPreservingFilters = function() {
          const next = new URL(window.location.href);
          const search = document.querySelector('.board-search')?.value.trim() || '';
          const assigned = !!document.querySelector('input[name="assignedToMe"]')?.checked;
          if (search) next.searchParams.set('q', search);
          else next.searchParams.delete('q');
          if (assigned) next.searchParams.set('assignedToMe', 'on');
          else next.searchParams.delete('assignedToMe');
          window.location.assign(next.toString());
        };

        function boardAnnouncements() {
          return {
            announcement: '',
            init() {
              const wsWrapper = this.$el.closest('[ws-connect]') || document.body;
              this.onMessage = (e) => {
                const msg = e.detail.message;
                if (typeof msg === 'string' && msg.includes('task-card')) {
                  this.announcement = 'Board updated';
                }
              };
              wsWrapper.addEventListener('htmx:wsAfterMessage', this.onMessage);
            },
            destroy() {
              const wsWrapper = this.$el.closest('[ws-connect]') || document.body;
              wsWrapper.removeEventListener('htmx:wsAfterMessage', this.onMessage);
            },
          };
        }

        // Initialize drag and drop + bulk-select.
        // Event delegation on .kanban-board so handlers survive HTMX innerHTML swaps
        // (search/filter replace column children — per-element listeners would be lost).
        // Note: flushing a board refresh queued while a dialog was open is handled
        // by the shared dialog MutationObserver in /js/app.js.
        document.addEventListener('DOMContentLoaded', function() {
          const board = document.querySelector('.kanban-board');
          if (!board) return;

          // --- Task drag-and-drop via event delegation ---
          board.addEventListener('dragover', (e) => {
            const container = e.target.closest('.column-tasks');
            if (!container) return;
            e.preventDefault();
            container.classList.add('drag-over');
          });

          board.addEventListener('dragleave', (e) => {
            const container = e.target.closest('.column-tasks');
            if (!container) return;
            container.classList.remove('drag-over');
          });

          board.addEventListener('drop', async (e) => {
            const container = e.target.closest('.column-tasks');
            if (!container) return;

            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('drag-over');

            const taskId = e.dataTransfer.getData('text/plain');
            const dragType = e.dataTransfer.getData('drag-type');
            const columnId = container.dataset.columnId;

            if (!taskId || !columnId || dragType !== 'task') return;

            const searchActive = !!document.querySelector('.board-search')?.value.trim();
            const assignedOnly = !!document.querySelector('input[name="assignedToMe"]')?.checked;
            const archivedView = new URLSearchParams(window.location.search).get('archived') === 'true';
            if (searchActive || assignedOnly || archivedView) {
              window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { type: 'error', message: 'Clear board filters before reordering tasks' }
              }));
              return;
            }

            // Extract all card elements inside target column and filter out the dragged task
            const cards = Array.from(container.querySelectorAll('.task-card'));
            const cardIds = cards
              .map(c => (c instanceof HTMLElement ? c.dataset.taskId : null))
              .filter(id => !!id && id !== taskId);

            // Find the card the task was dropped on top of (if any)
            const targetCard = e.target instanceof Element ? e.target.closest('.task-card') : null;
            let targetIndex = cardIds.length;

            if (targetCard && targetCard instanceof HTMLElement) {
              const targetCardId = targetCard.dataset.taskId;
              if (targetCardId) {
                const index = cardIds.indexOf(targetCardId);
                if (index > -1) {
                  const rect = targetCard.getBoundingClientRect();
                  const relativeY = e.clientY - rect.top;
                  targetIndex = relativeY < rect.height / 2 ? index : index + 1;
                }
              }
            }

            cardIds.splice(targetIndex, 0, taskId);

            const formData = new FormData();
            formData.append('taskIds', cardIds.join(','));

            const response = await fetch(\`/columns/\${columnId}/tasks/reorder\`, {
              method: 'POST',
              body: formData
            });

            if (response.headers.get('HX-Refresh') === 'true' || response.ok) {
              window.location.reload();
            } else {
              if (typeof htmx !== 'undefined') {
                htmx.trigger(container, 'load');
              } else {
                window.location.reload();
              }
            }
          });

          // --- Bulk-select mode ---
          const bulkToggle = document.getElementById('bulk-toggle');
          const bulkForm = document.getElementById('bulk-delete-form');
          const bulkIdsInput = document.getElementById('bulk-taskIds');
          const bulkCount = document.getElementById('bulk-count');
          const kanbanBoardEl = document.querySelector('.kanban-board');

          function refreshBulk() {
            const selected = Array.from(document.querySelectorAll('.bulk-select-cb:checked')).map(
              (cb) => cb.getAttribute('data-bulk-id') || ''
            );
            document.querySelectorAll('.task-card').forEach((card) => {
              const id = card.getAttribute('data-task-id');
              card.classList.toggle('selected', selected.includes(id));
            });
            if (bulkCount) bulkCount.textContent = String(selected.length);
            if (bulkForm) bulkForm.style.display = selected.length > 0 ? 'inline-flex' : 'none';
            if (bulkIdsInput) bulkIdsInput.value = selected.join(',');
          }

          if (bulkToggle && kanbanBoardEl) {
            bulkToggle.addEventListener('click', () => {
              kanbanBoardEl.classList.toggle('bulk-mode');
              const on = kanbanBoardEl.classList.contains('bulk-mode');
              bulkToggle.textContent = on ? 'Cancel' : 'Select';
              if (!on) {
                document.querySelectorAll('.bulk-select-cb').forEach((cb) => (cb.checked = false));
                refreshBulk();
              }
            });
            // Checkbox changes (event delegation, since cards reload via HTMX)
            document.addEventListener('change', (e) => {
              if (e.target instanceof HTMLElement && e.target.classList.contains('bulk-select-cb')) {
                refreshBulk();
              }
            });
          }
        });
      `}</script>
    </>
  );
}
