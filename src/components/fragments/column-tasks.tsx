import type { TaskCardTask } from '../task-card';
import { TaskCard } from '../task-card';

interface ColumnTasksProps {
  columnId: string;
  tasks: TaskCardTask[];
}

export function ColumnTasks({ columnId, tasks }: ColumnTasksProps) {
  return (
    <>
      {tasks.length === 0 ? (
        <p class="empty-state empty-column">
          No tasks yet. Click <strong>+ Add Task</strong> to create one.
        </p>
      ) : (
        tasks.map((task) => <TaskCard task={task} />)
      )}

      {columnId ? (
        <script data-column-id={columnId} data-task-count={tasks.length}>{`
          (function() {
            const script = document.currentScript;
            const columnId = script?.dataset.columnId;
            if (!columnId) return;
            const taskCount = document.getElementById('task-count-' + columnId);
            if (taskCount) {
              const count = Number(script.dataset.taskCount || 0);
              taskCount.textContent = count;

              const columnEl = document.querySelector(\`.kanban-column[data-column-id="\${columnId}"]\`);
              if (columnEl) {
                const wipLimit = parseInt(columnEl.dataset.wipLimit || '0', 10);
                if (wipLimit > 0 && count > wipLimit) {
                  columnEl.classList.add('wip-exceeded');
                } else {
                  columnEl.classList.remove('wip-exceeded');
                }
              }
            }
          })();
        `}</script>
      ) : null}
    </>
  );
}
