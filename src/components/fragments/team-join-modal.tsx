import { Modal } from '../modal';

export function TeamJoinModal() {
  return (
    <>
      <Modal title="Join a Team">
        <form
          method="post"
          action="/teams/join"
          hx-post="/teams/join"
          hx-target="find .modal-errors"
          hx-swap="innerHTML"
        >
          <div class="modal-errors" aria-live="polite"></div>
          <label for="teamSlug">Invite Link</label>
          <input
            type="text"
            id="teamSlug"
            name="teamSlug"
            required
            minlength="2"
            placeholder="Paste the full invite link from a teammate"
            autofocus
          />
          <small>
            Paste the full invite URL (it includes a secret token). A team slug alone is not enough.
          </small>

          <div class="form-actions">
            <button type="button" class="secondary" onclick="this.closest('dialog').remove()">
              Cancel
            </button>
            <button type="submit">Join Team</button>
          </div>
        </form>
      </Modal>
      <script>{`document.querySelector('#teamSlug')?.focus()`}</script>
    </>
  );
}
