import type { PropsWithChildren } from '@kitajs/html';
import { Modal } from '../modal';

interface ColumnEditColumn {
  id: string;
  name: string;
  color: string | null;
  wipLimit: number | null;
}

interface ColumnEditProps {
  teamSlug: string;
  boardSlug: string;
  column: ColumnEditColumn;
}

export function ColumnEdit({ teamSlug, boardSlug, column }: PropsWithChildren<ColumnEditProps>) {
  const color = column.color || '#e5e7eb';
  return (
    <>
      <Modal title="Edit Column">
        <form
          method="post"
          action={`/teams/${teamSlug}/boards/${boardSlug}/columns/${column.id}`}
          hx-post={`/teams/${teamSlug}/boards/${boardSlug}/columns/${column.id}`}
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
            value={column.name}
            autofocus
          />

          <label for="columnColor">Column Color</label>
          <div class="color-picker">
            <input type="color" id="columnColor" name="color" value={color} />
            <span safe class="color-value">
              {color}
            </span>
          </div>

          <label for="columnWipLimit">WIP Limit (optional)</label>
          <input
            type="number"
            id="columnWipLimit"
            name="wipLimit"
            min="1"
            max="50"
            placeholder="Maximum tasks in this column"
            value={column.wipLimit ? String(column.wipLimit) : ''}
          />
          <small>Limit the number of tasks in this column</small>

          <div class="form-actions">
            <button type="button" class="secondary" onclick="this.closest('dialog').remove()">
              Cancel
            </button>
            <button type="submit">Save Changes</button>
          </div>
        </form>

        <hr />

        <form
          method="post"
          hx-post={`/teams/${teamSlug}/boards/${boardSlug}/columns/${column.id}/delete`}
          hx-target="#modal-container"
          hx-swap="outerHTML"
          hx-confirm="Are you sure? This will also delete all tasks in this column."
        >
          <button type="submit" class="contrast danger">
            Delete Column
          </button>
        </form>
      </Modal>
      <script>{`
        const colorInput = document.querySelector('#columnColor');
        const colorValue = document.querySelector('.color-value');
        if (colorInput && colorValue) {
          colorInput.addEventListener('input', function() {
            colorValue.textContent = this.value;
          });
        }
        document.querySelector('#columnName')?.focus();
      `}</script>
    </>
  );
}
