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
        <div
          class="column-tasks-meta"
          hidden
          data-column-id={columnId}
          data-task-count={tasks.length}
        ></div>
      ) : null}
    </>
  );
}
