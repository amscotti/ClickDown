import { Modal } from '../modal';

interface TeamInviteProps {
  team: { name: string; slug: string };
  inviteLink: string;
  canRegenerate?: boolean;
}

export function TeamInviteSection({
  inviteLink,
  regenerated = false,
}: {
  inviteLink: string;
  regenerated?: boolean;
}) {
  return (
    <div id="invite-link-section" class="invite-link-section">
      <div class="invite-link-group">
        <input type="text" id="invite-link" readonly value={inviteLink} data-select-on-click />
        <button
          type="button"
          data-copy-target="#invite-link"
          data-copy-fallback={inviteLink}
          data-copy-prompt="Copy this invite link:"
        >
          Copy
        </button>
      </div>
      {regenerated ? (
        <p class="inline-success" role="status">
          Invite link regenerated — old links no longer work.
        </p>
      ) : null}
    </div>
  );
}

export function TeamInvite({ team, inviteLink, canRegenerate = true }: TeamInviteProps) {
  return (
    <Modal title={`Invite Members to ${team.name}`}>
      <div class="invite-section" id="invite-section">
        <p>Share this link with people you want to invite to this team:</p>

        <TeamInviteSection inviteLink={inviteLink} />

        <p class="invite-note">
          <small>
            Anyone with this link can join this team. The link includes a secret token — do not
            share the team slug alone. Share it only with people you trust.
          </small>
        </p>

        {canRegenerate && (
          <p>
            <button
              type="button"
              class="secondary outline"
              hx-post={`/teams/${team.slug}/invite/regenerate`}
              hx-target="#invite-link-section"
              hx-swap="outerHTML"
              hx-confirm="Regenerate invite link? Previous links will stop working."
            >
              Regenerate invite link
            </button>
          </p>
        )}
      </div>

      <div class="form-actions">
        <button type="button" data-modal-close="remove">
          Done
        </button>
      </div>
    </Modal>
  );
}
