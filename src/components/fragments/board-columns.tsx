import { alpine } from '../../utils/html';

interface BoardColumnsColumn {
  id: string;
  name: string;
  color: string | null;
  wipLimit: number | null;
}

interface BoardColumnsProps {
  boardBase: string;
  columns: BoardColumnsColumn[];
  tasksQuery: string;
  canAdmin: boolean;
}

/**
 * Children of `.kanban-board`. Rendered standalone as the HTMX partial for
 * search/filter requests, so the board element itself (its Alpine state and
 * delegated drag listeners) is never replaced — swapping innerHTML with a
 * fragment that contained the board itself previously nested boards and
 * broke column drag-reorder.
 */
export function BoardColumns({ boardBase, columns, tasksQuery, canAdmin }: BoardColumnsProps) {
  return (
    <>
      {columns.map((column) => (
        <section
          class="kanban-column"
          data-column-id={column.id}
          data-wip-limit={column.wipLimit || 0}
          {...alpine({
            '@dragover': 'handleColumnDragOver($event)',
            '@dragleave': 'handleColumnDragLeave($event)',
            '@drop': 'handleColumnDrop($event)',
          })}
        >
          <header
            class="column-header"
            style={column.color ? `--column-color: ${column.color}` : undefined}
          >
            <div class="column-header-left">
              {canAdmin && (
                <>
                  {/* biome-ignore lint/a11y/useFocusableInteractive: drag handle needs span for draggable API */}
                  {/* biome-ignore lint/a11y/useSemanticElements: drag handle needs span for draggable API */}
                  <span
                    class="column-drag-handle"
                    draggable="true"
                    role="button"
                    tabindex="0"
                    aria-label="Drag to reorder column"
                    title="Drag to reorder column"
                    {...alpine({
                      '@dragstart': `handleColumnDragStart($event, '${column.id}')`,
                      '@dragend': 'handleColumnDragEnd($event)',
                    })}
                  >
                    ⋮⋮
                  </span>
                </>
              )}
              <h3 safe>{column.name}</h3>
              <span class="task-count" id={`task-count-${column.id}`}>
                0
              </span>
              {column.wipLimit && (
                <span class="wip-limit" title="WIP Limit">
                  {column.wipLimit}
                </span>
              )}
            </div>
            {canAdmin && (
              <div class="column-header-right">
                <button
                  type="button"
                  class="column-menu-btn"
                  hx-get={`${boardBase}/columns/${column.id}/edit`}
                  hx-target="#modal-container"
                  aria-label="Column options"
                  title="Edit column"
                >
                  ⋮
                </button>
              </div>
            )}
          </header>

          <div
            id={`column-tasks-${column.id}`}
            class="column-tasks"
            data-column-id={column.id}
            hx-get={`${boardBase}/columns/${column.id}/tasks${tasksQuery}`}
            hx-trigger="load, task-updated from:body"
            hx-target="this"
            hx-swap="innerHTML"
          >
            <div class="loading-spinner">Loading tasks...</div>
          </div>

          <footer class="column-footer">
            <button
              type="button"
              hx-get={`${boardBase}/tasks/new?columnId=${column.id}`}
              hx-target="#modal-container"
              class="secondary"
            >
              + Add Task
            </button>
          </footer>
        </section>
      ))}

      {canAdmin && (
        <button
          type="button"
          hx-get={`${boardBase}/columns/new`}
          hx-target="#modal-container"
          class="add-column-btn"
        >
          + Add Column
        </button>
      )}
    </>
  );
}
