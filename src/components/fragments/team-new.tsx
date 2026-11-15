import { Modal } from '../modal';

export function TeamNew() {
  return (
    <Modal title="Create New Team">
      <form
        method="post"
        action="/teams"
        hx-post="/teams"
        hx-target="find .modal-errors"
        hx-swap="innerHTML"
      >
        <div class="modal-errors" aria-live="polite"></div>
        <label for="teamName">Team Name</label>
        <input
          type="text"
          id="teamName"
          name="name"
          required
          minlength="2"
          maxlength="50"
          placeholder="e.g. Engineering, Marketing, Design"
          autofocus
        />

        <label for="teamDescription">Description (optional)</label>
        <textarea
          id="teamDescription"
          name="description"
          rows="3"
          placeholder="What is this team for?"
        ></textarea>

        <div class="form-actions">
          <button type="button" class="secondary" data-modal-close="remove">
            Cancel
          </button>
          <button type="submit">Create Team</button>
        </div>
      </form>
    </Modal>
  );
}
