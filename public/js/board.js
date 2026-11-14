// ClickDown Board Interactions (presence, announcements, drag-and-drop, bulk actions)
window.isDragging = false;

// Reload the board, keeping the viewer's current search/filter state.
window.reloadBoardPreservingFilters = () => {
  const next = new URL(window.location.href);
  const search = document.querySelector('.board-search')?.value.trim() || '';
  const assigned = !!document.querySelector('input[name="assignedToMe"]')?.checked;
  if (search) next.searchParams.set('q', search);
  else next.searchParams.delete('q');
  if (assigned) next.searchParams.set('assignedToMe', 'on');
  else next.searchParams.delete('assignedToMe');
  window.location.assign(next.toString());
};

document.addEventListener('alpine:init', () => {
  Alpine.data('boardPresence', () => ({
    activeUsers: [],
    connectionCounts: {},

    avatarUrl(user) {
      return `/api/avatar/${user.avatarSeed}?name=${encodeURIComponent(user.name)}`;
    },

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
            if (!this.activeUsers.find((u) => u.userId === data.userId)) {
              this.activeUsers.push({
                userId: data.userId,
                name: data.name,
                avatarSeed: data.avatarSeed,
              });
            }
          } else if (data.type === 'roster') {
            for (const u of data.users || []) {
              if (u.userId === currentUserId) continue;
              this.connectionCounts[u.userId] = (this.connectionCounts[u.userId] || 0) + 1;
              if (!this.activeUsers.find((x) => x.userId === u.userId)) {
                this.activeUsers.push(u);
              }
            }
          } else if (data.type === 'absence') {
            this.connectionCounts[data.userId] = Math.max(
              0,
              (this.connectionCounts[data.userId] || 0) - 1
            );
            if (this.connectionCounts[data.userId] === 0) {
              this.activeUsers = this.activeUsers.filter((u) => u.userId !== data.userId);
              delete this.connectionCounts[data.userId];
            }
          } else if (data.type === 'board-refresh') {
            if (data.triggeredBy && data.triggeredBy === currentUserId) return;
            if (document.querySelector('dialog[open]')) {
              if (!document.body.dataset.boardRefreshPending) {
                document.body.dataset.boardRefreshPending = '1';
                window.dispatchEvent(
                  new CustomEvent('show-toast', {
                    detail: {
                      type: 'info',
                      message:
                        'This board changed elsewhere — it will refresh when you close this dialog.',
                    },
                  })
                );
              }
              return;
            }
            if (window.isDragging) return;
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
  }));

  Alpine.data('boardAnnouncements', () => ({
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
  }));
});

function syncColumnCounts(root = document) {
  const metas = root.querySelectorAll?.('.column-tasks-meta') ?? [];
  for (const meta of metas) {
    const columnId = meta.dataset.columnId;
    if (!columnId) continue;
    const count = Number(meta.dataset.taskCount || 0);
    const taskCount = document.getElementById(`task-count-${columnId}`);
    if (taskCount) taskCount.textContent = String(count);

    const columnEl = document.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
    if (columnEl) {
      const wipLimit = Number.parseInt(columnEl.dataset.wipLimit || '0', 10);
      columnEl.classList.toggle('wip-exceeded', wipLimit > 0 && count > wipLimit);
    }
  }
}

document.addEventListener('htmx:afterSwap', (e) => {
  syncColumnCounts(e.detail?.target || document);
});

document.addEventListener('htmx:afterSettle', (e) => {
  syncColumnCounts(e.detail?.target || document);
});

document.addEventListener('DOMContentLoaded', () => {
  const board = document.querySelector('.kanban-board');
  if (!board) return;

  syncColumnCounts(board);

  // Auto-open deep-linked task modal, then strip ?task= from the URL so
  // subsequent reloads (e.g. from drag-and-drop) do not re-open it.
  const openTaskId = board.dataset.openTaskId;
  if (openTaskId && typeof htmx !== 'undefined') {
    htmx.ajax('GET', `/tasks/${encodeURIComponent(openTaskId)}`, { target: '#modal-container' });
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  let draggedTaskId = null;
  let draggedColumnId = null;

  function openTaskDetail(taskId) {
    if (!taskId || typeof htmx === 'undefined') return;
    htmx.ajax('GET', `/tasks/${encodeURIComponent(taskId)}`, { target: '#modal-container' });
  }

  function clearDragHighlights() {
    for (const el of document.querySelectorAll('.drag-over')) {
      el.classList.remove('drag-over');
    }
    for (const el of document.querySelectorAll('.column-drag-over')) {
      el.classList.remove('column-drag-over');
    }
  }

  // Task card click & keyboard open via delegation
  board.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('.bulk-select-cb')) return;
    const card = e.target.closest('.task-card');
    if (!card || !(card instanceof HTMLElement)) return;
    if (window.isDragging || board.classList.contains('bulk-mode')) return;
    openTaskDetail(card.dataset.taskId);
  });

  board.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!(e.target instanceof HTMLElement) || !e.target.classList.contains('task-card')) return;
    if (board.classList.contains('bulk-mode')) return;
    if (e.key === ' ') e.preventDefault();
    openTaskDetail(e.target.dataset.taskId);
  });

  // Drag start & end for both column handles and task cards
  board.addEventListener('dragstart', (e) => {
    if (!(e.target instanceof Element)) return;
    const colHandle = e.target.closest('.column-drag-handle');
    if (colHandle) {
      const col = colHandle.closest('.kanban-column');
      const columnId = col instanceof HTMLElement ? col.dataset.columnId : '';
      if (!col || !columnId) return;
      draggedColumnId = columnId;
      col.classList.add('column-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', columnId);
        e.dataTransfer.setData('drag-type', 'column');
      }
      return;
    }

    const card = e.target.closest('.task-card');
    if (card instanceof HTMLElement) {
      const taskId = card.dataset.taskId || '';
      if (!taskId) return;
      draggedTaskId = taskId;
      window.isDragging = true;
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.setData('drag-type', 'task');
      }
    }
  });

  board.addEventListener('dragend', (e) => {
    if (e.target instanceof Element) {
      e.target.closest('.task-card')?.classList.remove('dragging');
      e.target.closest('.kanban-column')?.classList.remove('column-dragging');
    }
    draggedTaskId = null;
    draggedColumnId = null;
    setTimeout(() => {
      window.isDragging = false;
    }, 100);
    clearDragHighlights();
  });

  board.addEventListener('dragover', (e) => {
    if (!(e.target instanceof Element)) return;
    const container = e.target.closest('.column-tasks');
    if (container) {
      e.preventDefault();
      container.classList.add('drag-over');
    }
    const column = e.target.closest('.kanban-column');
    if (column) {
      e.preventDefault();
      if (draggedColumnId) column.classList.add('column-drag-over');
    }
  });

  board.addEventListener('dragleave', (e) => {
    if (!(e.target instanceof Element)) return;
    e.target.closest('.column-tasks')?.classList.remove('drag-over');
    e.target.closest('.kanban-column')?.classList.remove('column-drag-over');
  });

  board.addEventListener('drop', async (e) => {
    e.preventDefault();
    clearDragHighlights();
    if (!(e.target instanceof Element)) return;

    const transferId = e.dataTransfer?.getData('text/plain') || '';
    const dragType = e.dataTransfer?.getData('drag-type') || '';

    if (dragType === 'column' || (!dragType && draggedColumnId)) {
      const colId = transferId || draggedColumnId;
      const targetColumn = e.target.closest('.kanban-column');
      if (!colId || !targetColumn) return;

      const columns = Array.from(document.querySelectorAll('.kanban-column'));
      const columnIds = columns.map((col) => col.dataset.columnId).filter(Boolean);
      const oldIndex = columnIds.indexOf(colId);
      if (oldIndex > -1) columnIds.splice(oldIndex, 1);

      const newIndex = columns.indexOf(targetColumn);
      columnIds.splice(newIndex, 0, colId);

      const boardId = board instanceof HTMLElement ? board.dataset.boardId : '';
      if (!boardId) return;

      const formData = new FormData();
      formData.append('columnIds', columnIds.join(','));
      const reorderRes = await fetch(`/boards/${boardId}/columns/reorder`, {
        method: 'POST',
        body: formData,
      });

      if (reorderRes.ok) {
        try {
          const addButton = board.querySelector('.add-column-btn');
          for (const id of columnIds) {
            const col = board.querySelector(`.kanban-column[data-column-id="${id}"]`);
            if (col) board.insertBefore(col, addButton || null);
          }
        } catch {
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
      return;
    }

    const container = e.target.closest('.column-tasks');
    if (!container || !(container instanceof HTMLElement)) return;
    const taskId = transferId || draggedTaskId;
    const columnId = container.dataset.columnId;
    if (!taskId || !columnId || (dragType && dragType !== 'task')) return;

    const searchActive = !!document.querySelector('.board-search')?.value.trim();
    const assignedOnly = !!document.querySelector('input[name="assignedToMe"]')?.checked;
    const archivedView = new URLSearchParams(window.location.search).get('archived') === 'true';
    if (searchActive || assignedOnly || archivedView) {
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { type: 'error', message: 'Clear board filters before reordering tasks' },
        })
      );
      return;
    }

    const cards = Array.from(container.querySelectorAll('.task-card'));
    const cardIds = cards
      .map((c) => (c instanceof HTMLElement ? c.dataset.taskId : null))
      .filter((id) => !!id && id !== taskId);

    const targetCard = e.target.closest('.task-card');
    let targetIndex = cardIds.length;
    if (targetCard instanceof HTMLElement) {
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

    const response = await fetch(`/columns/${columnId}/tasks/reorder`, {
      method: 'POST',
      body: formData,
    });

    if (response.headers.get('HX-Refresh') === 'true' || response.ok) {
      window.location.reload();
    } else if (typeof htmx !== 'undefined') {
      htmx.trigger(container, 'load');
    } else {
      window.location.reload();
    }
  });

  // Bulk-select mode
  const bulkToggle = document.getElementById('bulk-toggle');
  const bulkForm = document.getElementById('bulk-delete-form');
  const bulkIdsInput = document.getElementById('bulk-taskIds');
  const bulkCount = document.getElementById('bulk-count');

  function refreshBulk() {
    const selected = Array.from(document.querySelectorAll('.bulk-select-cb:checked')).map(
      (cb) => cb.getAttribute('data-bulk-id') || ''
    );
    for (const card of document.querySelectorAll('.task-card')) {
      const id = card.getAttribute('data-task-id');
      card.classList.toggle('selected', selected.includes(id));
    }
    if (bulkCount) bulkCount.textContent = String(selected.length);
    if (bulkForm) bulkForm.style.display = selected.length > 0 ? 'inline-flex' : 'none';
    if (bulkIdsInput) bulkIdsInput.value = selected.join(',');
  }

  if (bulkToggle) {
    bulkToggle.addEventListener('click', () => {
      board.classList.toggle('bulk-mode');
      const on = board.classList.contains('bulk-mode');
      bulkToggle.textContent = on ? 'Cancel' : 'Select';
      if (!on) {
        for (const cb of document.querySelectorAll('.bulk-select-cb')) {
          cb.checked = false;
        }
        refreshBulk();
      }
    });
    document.addEventListener('change', (e) => {
      if (e.target instanceof HTMLElement && e.target.classList.contains('bulk-select-cb')) {
        refreshBulk();
      }
    });
  }
});
