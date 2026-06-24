interface TeamListItem {
  slug: string;
  name: string;
  memberCount: number;
  boardCount: number;
}

interface TeamListProps {
  teams: TeamListItem[];
}

export function TeamList({ teams }: TeamListProps) {
  return (
    <>
      {teams.length === 0 ? (
        <p style="color: var(--pico-muted-color);">No teams yet.</p>
      ) : (
        <ul class="team-list">
          {teams.map((team) => (
            <li>
              <a href={`/teams/${team.slug}`} class="team-card">
                <div class="team-info">
                  <strong safe>{team.name}</strong>
                  <small>
                    {team.memberCount} members, {team.boardCount} boards
                  </small>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div class="sidebar-team-actions">
        <a
          href="/teams/new"
          hx-get="/teams/new"
          hx-target="#modal-container"
          class="sidebar-action-link"
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Team
        </a>
        <span class="sidebar-actions-divider">|</span>
        <a
          href="/teams/join-modal"
          hx-get="/teams/join-modal"
          hx-target="#modal-container"
          class="sidebar-action-link"
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
          </svg>
          Join Team
        </a>
      </div>
    </>
  );
}
