import { Modal } from '../modal';

interface BoardNewProps {
  teamSlug: string;
}

export function BoardNew({ teamSlug }: BoardNewProps) {
  return (
    <>
      <Modal title="Create New Board">
        <form
          method="post"
          action={`/teams/${teamSlug}/boards`}
          hx-post={`/teams/${teamSlug}/boards`}
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
            placeholder="e.g. Sprint 1, Backlog, Q1 Planning"
            autofocus
          />

          <label for="boardDescription">Description (optional)</label>
          <textarea
            id="boardDescription"
            name="description"
            rows="3"
            placeholder="What is this board for?"
          ></textarea>

          <p class="form-note">
            <small>Default columns will be created: Backlog, To Do, In Progress, Done</small>
          </p>

          <div class="form-actions">
            <button type="button" class="secondary" onclick="this.closest('dialog').remove()">
              Cancel
            </button>
            <button type="submit">Create Board</button>
          </div>
        </form>
      </Modal>
      <script>{`document.querySelector('#boardName')?.focus()`}</script>
    </>
  );
}
