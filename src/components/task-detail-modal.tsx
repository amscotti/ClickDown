import type { PropsWithChildren } from '@kitajs/html';
import { formatDateOnly, isDateOverdue, localToday, toDateOnly } from '../utils/date';
import { alpine } from '../utils/html';
import { ChecklistSection } from './checklist';
import { Modal } from './modal';

interface TaskDetailMember {
  user: { id: string; displayName: string };
}

interface TaskDetailActivity {
  userName: string;
  event: string;
  detail: string | null;
  createdAt: Date;
}

interface TaskDetailProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    assigneeId: string | null;
    assigneeName: string | null;
    assigneeAvatarSeed: string | null;
    dueDate: Date | null;
    archived: boolean;
    creatorName: string;
    createdAt: Date;
  };
  members: TaskDetailMember[];
  teamSlug: string;
  boardSlug: string;
  descriptionHtml: string;
  checklist: Array<{ id: string; text: string; completed: boolean }>;
  activity: TaskDetailActivity[];
  comments?: Array<{ id: string; userId: string; userName: string; body: string; createdAt: Date }>;
  labels?: Array<{ id: string; name: string; color: string }>;
  teamLabels?: Array<{ id: string; name: string; color: string }>;
  attachments?: Array<{ id: string; filename: string; sizeBytes: number }>;
  /** Current viewer, for comment moderation controls. */
  currentUserId?: string;
  canModerate?: boolean;
}

function formatDate(date: Date | string | null): string {
  return date ? toDateOnly(date) : '';
}

function formatDateDisplay(date: Date | string | null): string {
  if (!date) return '';
  return formatDateOnly(date, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(dueDate: Date | string | null): boolean {
  return isDateOverdue(dueDate);
}

export function TaskDetailModal({
  task,
  members,
  teamSlug,
  boardSlug,
  descriptionHtml: safeDescriptionHtml,
  checklist,
  activity,
  comments = [],
  labels = [],
  teamLabels = [],
  attachments = [],
  currentUserId = '',
  canModerate = false,
}: PropsWithChildren<TaskDetailProps>) {
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  void priorityOrder;

  return (
    <Modal title="Task Details" closeHandler="closeTaskModal(this.closest('dialog'))">
      <div class="task-detail-content">
        {/* Title with inline edit */}
        <div class="task-detail-field">
          <label for="taskTitleInput">Title</label>
          <input
            type="text"
            id="taskTitleInput"
            value={task.title}
            hx-patch={`/tasks/${task.id}/title`}
            hx-target="#taskTitleInput"
            hx-trigger="change, keyup[key=='Enter']"
            name="title"
            required
            minlength="2"
            maxlength="200"
          />
        </div>

        {/* Description with inline edit (Write/Preview — Markdown supported) */}
        <div class="task-detail-field" x-data="{ descMode: 'write' }">
          <label for="taskDescriptionInput">Description</label>
          {/* biome-ignore lint/a11y/useSemanticElements: toggle group needs div for flex layout */}
          <div
            class="md-toggle-group"
            role="group"
            aria-label="Description mode"
            style="margin-bottom: 0.5rem;"
          >
            <button
              type="button"
              class="md-toggle"
              {...alpine({
                ':class': "descMode==='write' ? 'active' : ''",
                '@click': "descMode='write'",
              })}
            >
              Write
            </button>
            <button
              type="button"
              class="md-toggle"
              {...alpine({
                ':class': "descMode==='preview' ? 'active' : ''",
                '@click': "descMode='preview'",
              })}
              hx-post="/markdown-preview"
              hx-target=".markdown-preview"
              hx-swap="innerHTML"
              hx-include="#taskDescriptionInput"
            >
              Preview
            </button>
          </div>
          <textarea
            safe
            id="taskDescriptionInput"
            x-show="descMode==='write'"
            rows="4"
            placeholder="Add a description... (Markdown supported: **bold**, *italic*, - lists, [link](url), # headings)"
            hx-patch={`/tasks/${task.id}/description`}
            hx-trigger="change"
            name="description"
          >
            {task.description || ''}
          </textarea>
          <div class="markdown-preview" x-show="descMode==='preview'" x-cloak>
            {safeDescriptionHtml}
            {!task.description && (
              <p class="text-muted" style="font-style:italic;">
                Nothing to preview yet.
              </p>
            )}
          </div>
        </div>

        {/* Priority with inline edit */}
        <div class="task-detail-field">
          <label for="taskPrioritySelect">Priority</label>
          <select
            id="taskPrioritySelect"
            hx-patch={`/tasks/${task.id}/priority`}
            hx-target="closest .task-detail-field"
            hx-swap="outerHTML"
            name="priority"
          >
            <option value="low" selected={task.priority === 'low'}>
              Low
            </option>
            <option value="medium" selected={task.priority === 'medium'}>
              Medium
            </option>
            <option value="high" selected={task.priority === 'high'}>
              High
            </option>
            <option value="urgent" selected={task.priority === 'urgent'}>
              Urgent
            </option>
          </select>
          <span class={`priority-indicator priority-${task.priority}`}></span>
        </div>

        {/* Assignee with inline edit */}
        <div class="task-detail-field">
          <label for="taskAssigneeSelect">Assignee</label>
          <select
            id="taskAssigneeSelect"
            hx-patch={`/tasks/${task.id}/assignee`}
            hx-target="#taskAssigneeDisplay"
            hx-swap="outerHTML"
            name="assigneeId"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option safe value={member.user.id} selected={task.assigneeId === member.user.id}>
                {member.user.displayName}
              </option>
            ))}
          </select>
          <div id="taskAssigneeDisplay" class="assignee-display">
            {task.assigneeName ? (
              <>
                <img
                  src={`/api/avatar/${task.assigneeAvatarSeed || task.assigneeId}?name=${encodeURIComponent(task.assigneeName)}`}
                  alt={task.assigneeName}
                  class="avatar-small"
                />
                <span safe>{task.assigneeName}</span>
              </>
            ) : (
              <span class="unassigned">Unassigned</span>
            )}
          </div>
        </div>

        {/* Due Date with inline edit */}
        <div class="task-detail-field">
          <label for="taskDueDateInput">Due Date</label>
          <input
            type="date"
            id="taskDueDateInput"
            value={formatDate(task.dueDate)}
            hx-patch={`/tasks/${task.id}/dueDate`}
            hx-target="#taskDueDateDisplay"
            hx-swap="outerHTML"
            name="dueDate"
            min={localToday()}
          />
          <div
            id="taskDueDateDisplay"
            class={`due-date-display ${isOverdue(task.dueDate) ? 'overdue' : ''}`}
          >
            {task.dueDate ? (
              <>
                {isOverdue(task.dueDate) && <span class="overdue-badge">Overdue:</span>}
                <time safe datetime={toDateOnly(task.dueDate)}>
                  {formatDateDisplay(task.dueDate)}
                </time>
              </>
            ) : (
              <span class="no-date">No due date</span>
            )}
          </div>
        </div>

        {/* Labels */}
        <div class="task-detail-field">
          <span class="field-heading">Labels</span>
          <div id="task-labels-list" class="task-labels">
            {labels.map((l) => (
              <span class="task-label" style={`background:${l.color}`}>
                <span safe>{l.name}</span>
                <button
                  type="button"
                  class="label-remove"
                  hx-delete={`/tasks/${task.id}/labels/${l.id}`}
                  hx-target="closest .task-label"
                  hx-swap="outerHTML"
                  aria-label="Remove label"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            method="post"
            class="label-add-form"
            hx-post={`/tasks/${task.id}/labels`}
            hx-target="#task-labels-list"
            hx-swap="outerHTML"
            style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;"
          >
            {teamLabels.length > 0 && (
              <select name="labelId">
                <option value="">Existing label…</option>
                {teamLabels.map((l) => (
                  <option safe value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <input type="text" name="name" placeholder="New label name" maxlength="40" />
            <input type="color" name="color" value="#6366f1" title="Color" />
            <button type="submit" class="secondary outline">
              Add label
            </button>
          </form>
        </div>

        {/* Checklist */}
        <div class="task-detail-field">
          <ChecklistSection checklist={checklist} taskId={task.id} />
        </div>

        {/* Attachments */}
        <div class="task-detail-field">
          <span class="field-heading">Attachments</span>
          <ul id="task-attachments" class="task-attachments">
            {attachments.map((a) => (
              <li id={`att-${a.id}`}>
                <a safe href={`/attachments/${a.id}/download`}>
                  {a.filename}
                </a>
                <small>({Math.round(a.sizeBytes / 1024)} KB)</small>
                <button
                  type="button"
                  class="secondary"
                  hx-delete={`/attachments/${a.id}`}
                  hx-target={`#att-${a.id}`}
                  hx-swap="outerHTML"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form
            method="post"
            hx-post={`/tasks/${task.id}/attachments`}
            hx-encoding="multipart/form-data"
            hx-target="#task-attachments"
            hx-swap="beforeend"
            style="margin-top:0.5rem;"
          >
            <input type="file" name="file" required />
            <button type="submit" class="secondary outline">
              Upload
            </button>
          </form>
        </div>

        {/* Comments */}
        <div class="task-detail-field">
          <span class="field-heading">Comments</span>
          <ul id="task-comments" class="task-comments">
            {comments.map((c) => (
              <li id={`comment-${c.id}`} class="task-comment">
                <strong safe>{c.userName}</strong>
                <p safe>{c.body}</p>
                <small safe>{new Date(c.createdAt).toLocaleString()}</small>
                {(canModerate || c.userId === currentUserId) && (
                  <button
                    type="button"
                    class="secondary outline comment-delete"
                    hx-post={`/comments/${c.id}/delete`}
                    hx-target={`#comment-${c.id}`}
                    hx-swap="outerHTML"
                    hx-confirm="Delete this comment?"
                    aria-label="Delete comment"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form
            method="post"
            hx-post={`/tasks/${task.id}/comments`}
            hx-target="#task-comments"
            hx-swap="beforeend"
            style="margin-top:0.5rem;"
          >
            <textarea
              name="body"
              rows="2"
              maxlength="2000"
              placeholder="Write a comment…"
              required
            ></textarea>
            <button type="submit" class="secondary outline">
              Comment
            </button>
          </form>
        </div>

        {/* Activity log */}
        {activity.length > 0 && (
          <div class="task-detail-field">
            <span>Activity</span>
            <ul class="activity-log">
              {activity.map((entry) => (
                <li class="activity-entry">
                  <span class="activity-dot"></span>
                  <span class="activity-text">
                    <strong safe>{entry.userName || 'Someone'}</strong>{' '}
                    <span safe>{entry.event}</span>
                    {entry.detail ? (
                      <>
                        : <em safe>{entry.detail}</em>
                      </>
                    ) : null}
                    <small safe>{new Date(entry.createdAt).toLocaleString()}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metadata (read-only) */}
        <div class="task-detail-meta">
          <small safe>
            Created by {task.creatorName}
            {new Date(task.createdAt).toLocaleDateString()}
          </small>
          <small safe class="task-id-ref">
            Task ID: {task.id}
          </small>
        </div>
      </div>

      <div class="form-actions">
        <form
          method="post"
          hx-post={`/teams/${teamSlug}/boards/${boardSlug}/tasks/${task.id}/delete`}
          hx-target="#modal-container"
          hx-swap="outerHTML"
          hx-confirm="Are you sure you want to delete this task? This action cannot be undone."
        >
          <button type="submit" class="contrast danger">
            Delete Task
          </button>
        </form>
        <button
          type="button"
          class="secondary"
          hx-post={`/tasks/${task.id}/${task.archived ? 'unarchive' : 'archive'}`}
          hx-swap="none"
          title={task.archived ? 'Restore this task' : 'Hide this task without deleting'}
        >
          {task.archived ? 'Unarchive' : 'Archive'}
        </button>
        {task.archived && (
          <form
            method="post"
            hx-post={`/tasks/${task.id}/purge`}
            hx-confirm="Permanently delete this archived task? This cannot be undone."
            style="display:inline"
          >
            <button type="submit" class="contrast danger">
              Delete forever
            </button>
          </form>
        )}
        <button
          type="button"
          class="secondary"
          hx-post={`/tasks/${task.id}/duplicate`}
          hx-swap="none"
          title="Create a copy of this task"
        >
          Duplicate
        </button>
        <button type="button" class="secondary" data-task-id={task.id} onclick="copyTaskLink(this)">
          Copy Link
        </button>
        <button type="button" class="secondary" onclick="closeTaskModal(this.closest('dialog'))">
          Close
        </button>
      </div>

      <script>{`
        function copyTaskLink(btn) {
          var taskId = btn.getAttribute('data-task-id');
          var link = window.location.origin + '/tasks/' + taskId;
          var done = function () {
            var original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = original; }, 2000);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(done).catch(function () {
              window.prompt('Copy this link:', link);
            });
          } else {
            window.prompt('Copy this link:', link);
          }
        }
      `}</script>
    </Modal>
  );
}
