interface TeamPageTeam {
  slug: string;
  name: string;
  description: string | null;
}

interface TeamPageMemberUser {
  id: string;
  avatarSeed: string;
  displayName: string;
  email: string;
}

interface TeamPageMember {
  role: string;
  user: TeamPageMemberUser;
}

export interface TeamPageBoard {
  slug: string;
  name: string;
  description: string | null;
  columnCount: number;
}

export interface TeamPageProps {
  team: TeamPageTeam;
  members: TeamPageMember[];
  boards: TeamPageBoard[];
  memberCount: number;
  boardCount: number;
  isOwner: boolean;
  canAdmin: boolean;
}

export function TeamPage({
  team,
  members,
  boards,
  memberCount,
  boardCount,
  isOwner,
  canAdmin,
}: TeamPageProps) {
  return (
    <>
      <div class="team-page">
        <header class="team-header">
          <div>
            <h1 safe>{team.name}</h1>
            {team.description ? <p safe>{team.description}</p> : null}
            <small class="team-meta">
              {memberCount} members · {boardCount} boards
            </small>
          </div>
          {canAdmin ? (
            <div class="team-actions">
              <button
                type="button"
                hx-get={`/teams/${team.slug}/edit`}
                hx-target="#modal-container"
              >
                Edit Team
              </button>
              <button
                type="button"
                hx-get={`/teams/${team.slug}/invite`}
                hx-target="#modal-container"
                class="secondary"
              >
                Invite Members
              </button>
            </div>
          ) : null}
        </header>

        <section class="team-content">
          <div class="team-section">
            <h2>Boards</h2>
            {boards.length === 0 ? (
              <div class="empty-state">
                <p>No boards yet. Create your first board to start organizing tasks.</p>
                {canAdmin ? (
                  <button
                    type="button"
                    hx-get={`/teams/${team.slug}/boards/new`}
                    hx-target="#modal-container"
                  >
                    + Create Board
                  </button>
                ) : null}
              </div>
            ) : (
              <div class="boards-grid">
                {boards.map((board) => (
                  <a href={`/teams/${team.slug}/boards/${board.slug}`} class="board-card">
                    <h3 safe>{board.name}</h3>
                    {board.description ? <p safe>{board.description}</p> : null}
                    <small>{board.columnCount} columns</small>
                  </a>
                ))}
                {canAdmin ? (
                  <button
                    type="button"
                    hx-get={`/teams/${team.slug}/boards/new`}
                    hx-target="#modal-container"
                    class="board-card create-board-card"
                  >
                    <span>+ Create Board</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div class="team-section">
            <h2>Members</h2>
            <div class="members-list">
              {members.map((member) => (
                <div class="member-card">
                  <img
                    src={`/api/avatar/${member.user.avatarSeed}?name=${encodeURIComponent(member.user.displayName)}`}
                    alt={member.user.displayName}
                    class="avatar-medium"
                  />
                  <div class="member-info">
                    <strong safe>{member.user.displayName}</strong>
                    <br />
                    <small safe>{member.user.email}</small>
                  </div>
                  {isOwner && member.role !== 'owner' ? (
                    <div class="member-controls">
                      <form
                        method="post"
                        hx-post={`/teams/${team.slug}/members/${member.user.id}/role`}
                        hx-trigger="change"
                        hx-swap="none"
                        title="Change role"
                      >
                        <select name="role" class="role-select">
                          <option value="admin" selected={member.role === 'admin'}>
                            Admin
                          </option>
                          <option value="member" selected={member.role === 'member'}>
                            Member
                          </option>
                        </select>
                      </form>
                      <form
                        method="post"
                        hx-post={`/teams/${team.slug}/members/${member.user.id}/remove`}
                        hx-confirm={`Remove ${member.user.displayName} from this team?`}
                        hx-swap="none"
                      >
                        <button
                          type="submit"
                          class="secondary outline member-remove"
                          title="Remove member"
                          aria-label="Remove member"
                        >
                          &times;
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span safe class={`role-badge ${member.role}`}>
                      {member.role}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div id="modal-container" />
    </>
  );
}
