import type { PropsWithChildren } from '@kitajs/html';
import { Modal } from '../modal';

interface BoardEditBoard {
  slug: string;
  name: string;
  description: string | null;
}

interface BoardEditProps {
  teamSlug: string;
  board: BoardEditBoard;
}

export function BoardEdit({ teamSlug, board }: PropsWithChildren<BoardEditProps>) {
  return (
    <Modal title="Edit Board">
      <form
        method="post"
        action={`/teams/${teamSlug}/boards/${board.slug}`}
        hx-post={`/teams/${teamSlug}/boards/${board.slug}`}
        hx-target="find .modal-errors"
        hx-swap="innerHTML"
      >
        <div class="modal-errors" aria-live="polite"></div>
        <label for="boardName">Board Name</label>
        <input
          type="text"
          id="boardName"
          name="name"
          required
          minlength="2"
          maxlength="50"
          value={board.name}
          autofocus
        />

        <label for="boardDescription">Description (optional)</label>
        <textarea
          safe
          id="boardDescription"
          name="description"
          rows="3"
          placeholder="What is this board for?"
        >
          {board.description || ''}
        </textarea>

        <div class="form-actions">
          <button type="button" class="secondary" data-modal-close="remove">
            Cancel
          </button>
          <button type="submit">Save Changes</button>
        </div>
      </form>

      <hr />
      <div class="danger-zone" style="margin-top: 1rem;">
        <h4>Danger Zone</h4>
        <p>
          <small>
            Once you delete a board, all its columns and tasks will be permanently removed. This
            action cannot be undone.
          </small>
        </p>
        <form
          method="post"
          hx-post={`/teams/${teamSlug}/boards/${board.slug}/delete`}
          hx-target="#modal-container"
          hx-swap="outerHTML"
          hx-confirm="Are you sure you want to delete this board? This will delete all columns and tasks inside it. This action cannot be undone."
        >
          <button type="submit" class="contrast danger">
            Delete Board
          </button>
        </form>
      </div>
    </Modal>
  );
}
