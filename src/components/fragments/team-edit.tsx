import type { PropsWithChildren } from '@kitajs/html';
import { Modal } from '../modal';

interface TeamEditTeam {
  slug: string;
  name: string;
  description: string | null;
}

interface TeamEditProps {
  team: TeamEditTeam;
  isOwner: boolean;
}

export function TeamEdit({ team, isOwner }: PropsWithChildren<TeamEditProps>) {
  return (
    <>
      <Modal title="Edit Team">
        <form
          method="post"
          action={`/teams/${team.slug}`}
          hx-post={`/teams/${team.slug}`}
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
            value={team.name}
            autofocus
          />

          <label for="teamDescription">Description (optional)</label>
          <textarea
            safe
            id="teamDescription"
            name="description"
            rows="3"
            placeholder="What is this team for?"
          >
            {team.description || ''}
          </textarea>

          <div class="form-actions">
            <button type="button" class="secondary" onclick="this.closest('dialog').remove()">
              Cancel
            </button>
            <button type="submit">Save Changes</button>
          </div>
        </form>

        {isOwner && (
          <>
            <hr />
            <div class="danger-zone" style="margin-top: 1rem;">
              <h4>Danger Zone</h4>
              <p>
                <small>Once you delete a team, there is no going back. Please be certain.</small>
              </p>
              <form
                method="post"
                hx-post={`/teams/${team.slug}/delete`}
                hx-target="#modal-container"
                hx-swap="outerHTML"
                hx-confirm="Are you sure you want to delete this team? This will delete all boards, columns, and tasks associated with it. This action cannot be undone."
              >
                <button type="submit" class="contrast danger">
                  Delete Team
                </button>
              </form>
            </div>
          </>
        )}
      </Modal>
      <script>{`document.querySelector('#teamName')?.focus()`}</script>
    </>
  );
}
