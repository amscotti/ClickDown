interface TaskCommentProps {
  comment: {
    id: string;
    userId: string;
    userName: string;
    body: string;
    createdAt: Date;
  };
  canDelete: boolean;
}

export function TaskCommentItem({ comment, canDelete }: TaskCommentProps) {
  return (
    <li id={`comment-${comment.id}`} class="task-comment">
      <strong safe>{comment.userName}</strong>
      <p safe>{comment.body}</p>
      <small safe>{new Date(comment.createdAt).toLocaleString()}</small>
      {canDelete ? (
        <button
          type="button"
          class="secondary outline comment-delete"
          hx-post={`/comments/${comment.id}/delete`}
          hx-target={`#comment-${comment.id}`}
          hx-swap="outerHTML"
          hx-confirm="Delete this comment?"
          aria-label="Delete comment"
        >
          Delete
        </button>
      ) : null}
    </li>
  );
}

interface TaskLabelsListProps {
  taskId: string;
  labels: Array<{ id: string; name: string; color: string }>;
}

export function TaskLabelsList({ taskId, labels }: TaskLabelsListProps) {
  return (
    <div id="task-labels-list" class="task-labels">
      {labels.map((l) => (
        <span class="task-label" style={`--label-color:${l.color};background:${l.color}`}>
          <span safe>{l.name}</span>
          <button
            type="button"
            class="label-remove"
            hx-delete={`/tasks/${taskId}/labels/${l.id}`}
            hx-target="closest .task-label"
            hx-swap="outerHTML"
            aria-label="Remove label"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

interface TaskAttachmentProps {
  attachment: {
    id: string;
    filename: string;
    sizeBytes: number;
  };
}

export function TaskAttachmentItem({ attachment }: TaskAttachmentProps) {
  return (
    <li id={`att-${attachment.id}`}>
      <a safe href={`/attachments/${attachment.id}/download`}>
        {attachment.filename}
      </a>
      <small>({Math.round(attachment.sizeBytes / 1024)} KB)</small>
      <button
        type="button"
        class="secondary"
        hx-delete={`/attachments/${attachment.id}`}
        hx-target={`#att-${attachment.id}`}
        hx-swap="outerHTML"
      >
        Remove
      </button>
    </li>
  );
}
