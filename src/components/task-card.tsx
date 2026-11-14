import type { PropsWithChildren } from '@kitajs/html';
import { formatDateOnly, isDateOverdue, toDateOnly } from '../utils/date';

interface TaskAssignee {
  displayName: string;
  avatarSeed: string;
}

export interface TaskCardTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | Date | null;
  assignee: TaskAssignee | null;
}

interface TaskCardProps {
  task: TaskCardTask;
}

function formatDate(date: Date | string) {
  return {
    display: formatDateOnly(date, { month: 'short', day: 'numeric' }),
    isOverdue: isDateOverdue(date),
  };
}

export function TaskCard({ task }: PropsWithChildren<TaskCardProps>) {
  const dueDateInfo = task.dueDate ? formatDate(task.dueDate) : null;
  const safeDueDateDisplay = dueDateInfo?.display;

  return (
    <>
      {/* biome-ignore lint/a11y/useFocusableInteractive: task card needs div for draggable clickable card */}
      {/* biome-ignore lint/a11y/useSemanticElements: task card needs div for draggable clickable card */}
      <div
        id={`task-${task.id}`}
        class="task-card"
        data-task-id={task.id}
        data-priority={task.priority}
        draggable="true"
        tabindex="0"
        role="button"
        aria-label={`Task: ${task.title}`}
      >
        <input
          type="checkbox"
          class="bulk-select-cb"
          data-bulk-id={task.id}
          aria-label="Select task for bulk actions"
        />
        <div class="task-card-content">
          <header class="task-card-header">
            <span class={`priority-badge ${task.priority}`} title={`${task.priority} priority`}>
              <span class="priority-dot"></span>
              <span safe>{task.priority}</span>
            </span>
            <h4 safe>{task.title}</h4>
          </header>

          {task.description ? (
            <p safe class="task-description">
              {task.description.length > 100
                ? `${task.description.substring(0, 100)}...`
                : task.description}
            </p>
          ) : null}

          <footer class="task-card-footer">
            {task.assignee ? (
              <div class="task-assignee" title={task.assignee.displayName}>
                <img
                  src={`/api/avatar/${task.assignee.avatarSeed}?name=${encodeURIComponent(task.assignee.displayName)}`}
                  alt={task.assignee.displayName}
                  class="avatar-small"
                />
              </div>
            ) : (
              <div class="task-assignee unassigned" title="Unassigned">
                <div class="avatar-placeholder-small" aria-hidden="true">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
              </div>
            )}

            {dueDateInfo ? (
              <time
                class={`task-due-date ${dueDateInfo.isOverdue ? 'overdue' : ''}`}
                datetime={task.dueDate ? toDateOnly(task.dueDate) : undefined}
                title={dueDateInfo.isOverdue ? 'Overdue' : 'Due date'}
              >
                {dueDateInfo.isOverdue ? '!' : ''}
                {safeDueDateDisplay}
              </time>
            ) : null}
          </footer>
        </div>

        <div class="task-card-drag-handle" title="Drag to move">
          ⋮⋮
        </div>
      </div>
    </>
  );
}
