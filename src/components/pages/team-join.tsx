interface TeamJoinTeam {
  slug: string;
  name: string;
  description: string | null;
}

export function TeamJoinPage({ team, inviteToken }: { team: TeamJoinTeam; inviteToken: string }) {
  return (
    <div class="join-team-container">
      <article class="join-team-card">
        <header>
          <h2 safe>Join {team.name}?</h2>
        </header>

        <div class="team-details">
          {team.description ? <p safe>{team.description}</p> : null}

          <p>You've been invited to join this team on ClickDown.</p>
        </div>

        <form method="POST" action={`/teams/${team.slug}/join`}>
          <input type="hidden" name="inviteToken" value={inviteToken} />
          <button type="submit">Join Team</button>
          <a href="/" class="button secondary">
            Cancel
          </a>
        </form>
      </article>
    </div>
  );
}
