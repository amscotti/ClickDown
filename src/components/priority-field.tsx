import type { PropsWithChildren } from '@kitajs/html';
import { TASK_PRIORITIES, type TaskPriority } from '../models/task.model';

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function PriorityField({
  priority,
  taskId,
}: PropsWithChildren<{ priority: TaskPriority; taskId: string }>) {
  return (
    <div class="task-detail-field">
      <label for="taskPrioritySelect">Priority</label>
      <select
        id="taskPrioritySelect"
        hx-patch={`/tasks/${taskId}/priority`}
        hx-target="closest .task-detail-field"
        hx-swap="outerHTML"
        name="priority"
      >
        {TASK_PRIORITIES.map((p) => (
          <option safe value={p} selected={priority === p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>
      <span class={`priority-indicator priority-${priority}`}></span>
    </div>
  );
}
