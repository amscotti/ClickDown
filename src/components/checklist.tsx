import type { PropsWithChildren } from '@kitajs/html';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export function ChecklistSection({
  checklist,
  taskId,
  swapOob = false,
}: PropsWithChildren<{ checklist: ChecklistItem[]; taskId: string; swapOob?: boolean }>) {
  const done = checklist.filter((c) => c.completed).length;
  const pct = checklist.length ? Math.round((done / checklist.length) * 100) : 0;

  return (
    <div id={`checklist-section-${taskId}`} {...(swapOob ? { 'hx-swap-oob': 'true' } : {})}>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="margin-bottom:0;">Checklist</span>
        <small class="checklist-progress-label">
          {done}/{checklist.length}
        </small>
      </div>
      {checklist.length > 0 && (
        <div class="checklist-progress">
          <div class="checklist-progress-bar" style={`width: ${pct}%`}></div>
        </div>
      )}
      <ul class="checklist" id={`checklist-${taskId}`}>
        {checklist.map((item) => (
          <ChecklistItem item={item} taskId={taskId} />
        ))}
      </ul>
      <form
        method="post"
        class="checklist-add"
        hx-post={`/tasks/${taskId}/checklist`}
        hx-target={`#checklist-section-${taskId}`}
        hx-swap="outerHTML"
      >
        <input
          type="text"
          name="text"
          placeholder="Add a checklist item…"
          maxlength="200"
          required
        />
        <button type="submit" class="secondary">
          Add
        </button>
      </form>
    </div>
  );
}

export function ChecklistItem({
  item,
  taskId,
}: PropsWithChildren<{ item: ChecklistItem; taskId: string }>) {
  return (
    <li class={`checklist-item${item.completed ? ' completed' : ''}`}>
      <form
        method="post"
        hx-post={`/tasks/${taskId}/checklist/${item.id}/toggle`}
        hx-target={`#checklist-section-${taskId}`}
        hx-swap="outerHTML"
        class="checklist-toggle-form"
      >
        <input
          type="checkbox"
          id={`checklist-item-${item.id}`}
          name="completed"
          checked={item.completed}
          onchange="this.form.requestSubmit()"
          aria-label="Toggle complete"
        />
      </form>
      {item.text ? (
        <span safe class="checklist-text">
          {item.text}
        </span>
      ) : null}
      <form
        method="post"
        hx-post={`/tasks/${taskId}/checklist/${item.id}/delete`}
        hx-target={`#checklist-section-${taskId}`}
        hx-swap="outerHTML"
        hx-confirm="Delete this checklist item?"
        class="checklist-delete-form"
      >
        <button type="submit" class="checklist-delete" title="Delete item" aria-label="Delete item">
          &times;
        </button>
      </form>
    </li>
  );
}
