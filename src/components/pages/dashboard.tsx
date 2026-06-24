interface DashboardUser {
  avatarSeed: string;
  displayName: string;
  email: string;
}

interface DashboardTeam {
  boardCount: number;
}

interface DashboardBoard {
  slug: string;
  name: string;
}

interface DashboardTeamWithBoards {
  slug: string;
  name: string;
  description: string | null;
  boards: DashboardBoard[];
}

interface DashboardTask {
  id: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  columnName?: string;
  teamSlug?: string;
  boardSlug?: string;
  boardName?: string;
}

export interface DashboardProps {
  user: DashboardUser;
  teams: DashboardTeam[];
  teamsWithBoards: DashboardTeamWithBoards[];
  assignedTasks: DashboardTask[];
}

const isOverdue = (dueDate: Date | null) => {
  return isDateOverdue(dueDate);
};

const isDueSoon = (dueDate: Date | null) => {
  if (!dueDate) return false;
  const due = new Date(`${toDateOnly(dueDate)}T00:00:00.000Z`);
  const today = new Date(`${localToday()}T00:00:00.000Z`);
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 2;
};

const formatDate = (date: Date) => formatDateOnly(date, { month: 'short', day: 'numeric' });

export function DashboardPage({ user, teams, teamsWithBoards, assignedTasks }: DashboardProps) {
  const totalTeams = teams.length;
  const totalBoards = teams.reduce((acc, t) => acc + (t.boardCount || 0), 0);
  const totalAssigned = assignedTasks.length;
  const pressingTasksCount = assignedTasks.filter(
    (t) =>
      t.priority === 'urgent' ||
      t.priority === 'high' ||
      isOverdue(t.dueDate) ||
      isDueSoon(t.dueDate)
  ).length;

  return (
    <>
      <div class="dashboard-page-container">
        <aside class="sidebar">
          <div class="user-info">
            <img
              src={`/api/avatar/${user.avatarSeed}?name=${encodeURIComponent(user.displayName)}`}
              alt={user.displayName}
              class="avatar-large"
            />
            <div class="user-text">
              <strong safe>{user.displayName}</strong>
              <small safe>{user.email}</small>
            </div>
          </div>

          <nav>
            <h4>Your Teams</h4>
            <div
              id="team-list-container"
              hx-get="/teams/list"
              hx-trigger="load"
              hx-swap="innerHTML"
            />
          </nav>
        </aside>

        <main class="dashboard-main-content">
          {totalTeams === 0 ? (
            <div class="onboarding-welcome-card">
              <div class="welcome-header">
                <span class="welcome-badge">Get Started</span>
                <h2>Welcome to ClickDown!</h2>
                <p>
                  Collaborate in teams, build Kanban boards, track work-in-progress, and complete
                  milestones. Create a new team or join an existing workspace to start managing your
                  projects.
                </p>
              </div>
              <div class="onboarding-actions">
                <div
                  class="action-card"
                  hx-get="/teams/new"
                  hx-target="#modal-container"
                  style="cursor: pointer;"
                >
                  <div class="action-icon create-icon">
                    <svg
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="16" y1="11" x2="22" y2="11" />
                    </svg>
                  </div>
                  <h3>Create a New Team</h3>
                  <p>
                    Establish a brand-new space for your departments, squads, or personal projects.
                  </p>
                  <button type="button" class="btn-glow">
                    Create Your First Team
                  </button>
                </div>

                <div
                  class="action-card"
                  hx-get="/teams/join-modal"
                  hx-target="#modal-container"
                  style="cursor: pointer;"
                >
                  <div class="action-icon join-icon">
                    <svg
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <polyline points="16 11 18 13 22 9" />
                    </svg>
                  </div>
                  <h3>Join an Existing Team</h3>
                  <p>
                    Enter an invitation code shared by your teammate to jump right into their active
                    boards.
                  </p>
                  <button type="button" class="outline secondary">
                    Join a Team
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <header class="dashboard-summary-header">
                <div class="welcome-headline">
                  <h2>Dashboard Overview</h2>
                  <p safe>
                    Welcome back, {user.displayName}. Here is the status of your workspaces.
                  </p>
                </div>
                <div class="dashboard-header-actions">
                  <button
                    type="button"
                    hx-get="/teams/new"
                    hx-target="#modal-container"
                    class="outline secondary"
                  >
                    + Create Team
                  </button>
                  <button
                    type="button"
                    hx-get="/teams/join-modal"
                    hx-target="#modal-container"
                    class="outline secondary"
                  >
                    Join a Team
                  </button>
                </div>
              </header>

              <section class="dashboard-stats-grid">
                <div class="stat-card">
                  <div class="stat-meta">
                    <span class="stat-title">Active Teams</span>
                    <span class="stat-icon">
                      <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                    </span>
                  </div>
                  <span class="stat-number">{totalTeams}</span>
                </div>

                <div class="stat-card">
                  <div class="stat-meta">
                    <span class="stat-title">Kanban Boards</span>
                    <span class="stat-icon">
                      <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                        <line x1="15" y1="3" x2="15" y2="21" />
                      </svg>
                    </span>
                  </div>
                  <span class="stat-number">{totalBoards}</span>
                </div>

                <div class="stat-card">
                  <div class="stat-meta">
                    <span class="stat-title">Assigned Tasks</span>
                    <span class="stat-icon">
                      <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </span>
                  </div>
                  <span class="stat-number">{totalAssigned}</span>
                </div>

                <div class={`stat-card ${pressingTasksCount > 0 ? 'pressing-alarm' : ''}`}>
                  <div class="stat-meta">
                    <span class="stat-title">Pressing/Overdue</span>
                    <span class="stat-icon">
                      <svg
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </span>
                  </div>
                  <span class="stat-number">{pressingTasksCount}</span>
                </div>
              </section>

              <div class="dashboard-columns-container">
                <section class="dashboard-panel assigned-tasks-panel">
                  <div class="panel-header">
                    <h3>Assigned To You</h3>
                    <span class="panel-badge">{totalAssigned} tasks</span>
                  </div>

                  {totalAssigned === 0 ? (
                    <div class="tasks-empty-placeholder">
                      <div class="placeholder-emoji">🎉</div>
                      <h4>All Clean!</h4>
                      <p>
                        You don't have any active tasks assigned to you. Take a break or check other
                        column backlogs.
                      </p>
                    </div>
                  ) : (
                    <div class="dashboard-tasks-list">
                      {assignedTasks.map((task) => {
                        const overdue = isOverdue(task.dueDate);
                        const soon = isDueSoon(task.dueDate);
                        return (
                          <>
                            {/* biome-ignore lint/a11y/useFocusableInteractive: task item needs div for clickable card */}
                            {/* biome-ignore lint/a11y/useSemanticElements: task item needs div for clickable card */}
                            <div
                              class={`dashboard-task-item border-priority-${task.priority}`}
                              tabindex="0"
                              role="link"
                              onclick={`window.location.href='/tasks/${task.id}'`}
                              onkeydown={`if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.href='/tasks/${task.id}'}`}
                              title="Open this task on its board"
                              style="cursor: pointer;"
                            >
                              <div class="task-item-main">
                                <div class="task-item-title-row">
                                  <span safe class={`priority-badge ${task.priority}`}>
                                    {task.priority}
                                  </span>
                                  <h4 safe>{task.title}</h4>
                                </div>
                                <div class="task-item-context">
                                  <span class="context-label">Column:</span>{' '}
                                  <strong safe>{task.columnName}</strong>
                                  <span class="context-divider">•</span>
                                  <span class="context-label">Board:</span>
                                  <a
                                    href={`/teams/${task.teamSlug}/boards/${task.boardSlug}`}
                                    onclick="event.stopPropagation();"
                                    class="board-link"
                                  >
                                    <span safe>{task.boardName}</span>
                                  </a>
                                </div>
                              </div>

                              <div class="task-item-date-col">
                                {task.dueDate ? (
                                  <div
                                    class={`due-date-pill ${overdue ? 'overdue' : soon ? 'due-soon' : ''}`}
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
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span safe>
                                      {overdue
                                        ? 'Overdue'
                                        : soon
                                          ? 'Due soon'
                                          : formatDate(task.dueDate)}
                                    </span>
                                  </div>
                                ) : (
                                  <span class="no-due-date">No due date</span>
                                )}
                              </div>
                            </div>
                          </>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section class="dashboard-panel teams-navigator-panel">
                  <div class="panel-header">
                    <h3>Quick Access</h3>
                  </div>

                  <div class="navigator-teams-stack">
                    {teamsWithBoards.map((team) => (
                      <div class="navigator-team-card">
                        <div class="team-card-header">
                          <div class="team-card-title-row">
                            <h4>
                              <a href={`/teams/${team.slug}`} class="team-nav-link">
                                <span safe>{team.name}</span>
                              </a>
                            </h4>
                          </div>
                          <p safe class="team-desc-short">
                            {team.description || 'No description provided.'}
                          </p>
                        </div>

                        <div class="team-card-boards-list">
                          <h5>Boards</h5>
                          {team.boards.length === 0 ? (
                            <p class="no-boards-note">No boards in this team yet.</p>
                          ) : (
                            <div class="boards-quick-grid">
                              {team.boards.map((board) => (
                                <a
                                  href={`/teams/${team.slug}/boards/${board.slug}`}
                                  class="board-quick-pill"
                                >
                                  <svg
                                    aria-hidden="true"
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    style="margin-right: 0.25rem;"
                                  >
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <line x1="9" y1="3" x2="9" y2="21" />
                                  </svg>
                                  <span safe>{board.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </main>
      </div>

      <div id="modal-container" />
    </>
  );
}

import { formatDateOnly, isDateOverdue, localToday, toDateOnly } from '../../utils/date';
