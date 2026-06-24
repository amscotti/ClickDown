import { Modal } from '../modal';

interface TaskNewMember {
  user: {
    id: string;
    displayName: string;
  };
}

interface TaskNewProps {
  teamSlug: string;
  boardSlug: string;
  columnId: string;
  members: TaskNewMember[];
  minDate: string;
}

export function TaskNew({ teamSlug, boardSlug, columnId, members, minDate }: TaskNewProps) {
  return (
    <>
      <Modal title="Add New Task">
        <form
          method="post"
          action={`/teams/${teamSlug}/boards/${boardSlug}/tasks`}
          hx-post={`/teams/${teamSlug}/boards/${boardSlug}/tasks`}
          hx-target="find .modal-errors"
          hx-swap="innerHTML"
        >
          <div class="modal-errors" aria-live="polite"></div>
          <input type="hidden" name="columnId" value={columnId} />

          <label for="taskTitle">Title</label>
          <input
            type="text"
            id="taskTitle"
            name="title"
            required
            minlength="2"
            maxlength="200"
            placeholder="e.g. Fix navigation bug, Add user profile page"
            autofocus
          />

          <label for="taskDescription">Description (optional)</label>
          <textarea
            id="taskDescription"
            name="description"
            rows="3"
            placeholder="Add more details about this task..."
          ></textarea>

          <label for="taskPriority">Priority</label>
          <select id="taskPriority" name="priority">
            <option value="low">Low</option>
            <option value="medium" selected>
              Medium
            </option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          <label for="taskAssignee">Assignee (optional)</label>
          <select id="taskAssignee" name="assigneeId">
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option safe value={member.user.id}>
                {member.user.displayName}
              </option>
            ))}
          </select>

          <label for="taskDueDate">Due Date (optional)</label>
          <input type="date" id="taskDueDate" name="dueDate" min={minDate} />

          <div class="form-actions">
            <button type="button" class="secondary" onclick="this.closest('dialog').remove()">
              Cancel
            </button>
            <button type="submit">Create Task</button>
          </div>
        </form>
      </Modal>
      <script>{`document.querySelector('#taskTitle')?.focus()`}</script>
    </>
  );
}
