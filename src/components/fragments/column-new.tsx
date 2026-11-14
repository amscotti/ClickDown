import { Modal } from '../modal';

interface ColumnNewProps {
  teamSlug: string;
  boardSlug: string;
}

export function ColumnNew({ teamSlug, boardSlug }: ColumnNewProps) {
  return (
    <Modal title="Add New Column">
      <form
        method="post"
        action={`/teams/${teamSlug}/boards/${boardSlug}/columns`}
        hx-post={`/teams/${teamSlug}/boards/${boardSlug}/columns`}
        hx-target="find .modal-errors"
        hx-swap="innerHTML"
      >
        <div class="modal-errors" aria-live="polite"></div>
        <label for="columnName">Column Name</label>
        <input
          type="text"
          id="columnName"
          name="name"
          required
          minlength="2"
          maxlength="50"
          placeholder="e.g. Review, Testing, Deploy"
          autofocus
        />

        <label for="columnColor">Column Color</label>
        <div class="color-picker">
          <input
            type="color"
            id="columnColor"
            name="color"
            value="#e5e7eb"
            data-color-output=".color-value"
          />
          <span class="color-value">#e5e7eb</span>
        </div>

        <label for="columnWipLimit">WIP Limit (optional)</label>
        <input
          type="number"
          id="columnWipLimit"
          name="wipLimit"
          min="1"
          max="50"
          placeholder="Maximum tasks in this column"
        />
        <small>Limit the number of tasks in this column</small>

        <div class="form-actions">
          <button type="button" class="secondary" data-modal-close="remove">
            Cancel
          </button>
          <button type="submit">Add Column</button>
        </div>
      </form>
    </Modal>
  );
}
