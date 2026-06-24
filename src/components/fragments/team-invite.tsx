import { Modal } from '../modal';

interface TeamInviteProps {
  team: { name: string; slug: string };
  inviteLink: string;
  canRegenerate?: boolean;
}

export function TeamInvite({ team, inviteLink, canRegenerate = true }: TeamInviteProps) {
  return (
    <Modal title={`Invite Members to ${team.name}`}>
      <div class="invite-section" id="invite-section">
        <p>Share this link with people you want to invite to this team:</p>

        <div class="invite-link-group">
          <input type="text" id="invite-link" readonly value={inviteLink} onclick="this.select()" />
          <button
            type="button"
            data-invite-link={inviteLink}
            onclick="(function(btn){ var link=document.getElementById('invite-link')?.value||btn.dataset.inviteLink; var done=function(){btn.textContent='Copied!'; setTimeout(function(){btn.textContent='Copy'},2000);}; if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(link).then(done).catch(function(){ window.prompt('Copy this invite link:', link); }); } else { window.prompt('Copy this invite link:', link); } })(this)"
          >
            Copy
          </button>
        </div>

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
              hx-target="#invite-section"
              hx-swap="innerHTML"
              hx-confirm="Regenerate invite link? Previous links will stop working."
            >
              Regenerate invite link
            </button>
          </p>
        )}
      </div>

      <div class="form-actions">
        <button type="button" onclick="this.closest('dialog').remove()">
          Done
        </button>
      </div>
    </Modal>
  );
}
