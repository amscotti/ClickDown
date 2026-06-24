export function LandingPage() {
  return (
    <div class="landing-hero-container">
      <div class="landing-hero">
        <div class="hero-tagline">Hypermedia-Driven Kanban</div>
        <h1 class="hero-title">ClickDown</h1>
        <h2 class="hero-subtitle">Lightweight Kanban Task Management</h2>
        <p class="hero-description">
          A simple, fast, and beautiful way to manage tasks, enforce WIP limits, and collaborate
          with your team. Built with Bun, SQLite, and HTMX for instant, zero-latency server
          roundtrips.
        </p>
        <div class="hero-actions">
          <a href="/register" class="btn-glow">
            Get Started
          </a>
          <a href="/login" class="outline btn-outline-hero">
            Login to Account
          </a>
        </div>
      </div>

      {/* Visual Mockup of the Kanban Board */}
      <div class="landing-preview-container">
        <div class="landing-preview-board">
          <div class="preview-column">
            <div class="preview-column-header" style="--col-color: var(--priority-medium);">
              <span class="preview-dot"></span>
              <span>Backlog</span>
              <span class="preview-badge">2</span>
            </div>
            <div class="preview-tasks">
              <div class="preview-card" style="border-left: 4px solid var(--priority-medium);">
                <h5>Implement OAuth Login</h5>
                <p>Integrate secure third-party authenticators</p>
                <div class="preview-card-footer">
                  <span class="preview-priority-badge medium">Medium</span>
                </div>
              </div>
              <div class="preview-card" style="border-left: 4px solid var(--priority-low);">
                <h5>Write Migration API Docs</h5>
                <p>Document database schema and data paths</p>
                <div class="preview-card-footer">
                  <span class="preview-priority-badge low">Low</span>
                </div>
              </div>
            </div>
          </div>

          <div class="preview-column">
            <div class="preview-column-header" style="--col-color: var(--priority-high);">
              <span class="preview-dot"></span>
              <span>To Do</span>
              <span class="preview-badge">1</span>
            </div>
            <div class="preview-tasks">
              <div class="preview-card" style="border-left: 4px solid var(--priority-high);">
                <h5>E2E Playwright Suite</h5>
                <p>Validate all boards and tasks lifecycle flows</p>
                <div class="preview-card-footer">
                  <span class="preview-priority-badge high">High</span>
                </div>
              </div>
            </div>
          </div>

          <div class="preview-column">
            <div class="preview-column-header" style="--col-color: var(--priority-urgent);">
              <span class="preview-dot"></span>
              <span>Done</span>
              <span class="preview-badge">1</span>
            </div>
            <div class="preview-tasks">
              <div class="preview-card" style="border-left: 4px solid var(--priority-urgent);">
                <h5>Visual UI Overhaul</h5>
                <p>Standardized typography, cards, and navigation</p>
                <div class="preview-card-footer">
                  <span class="preview-priority-badge urgent">Urgent</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div class="landing-features">
        <div class="feature-card">
          <div class="feature-icon htmx-icon">
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
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <h4>Hypermedia Powered</h4>
          <p>
            Instant HTML-over-the-wire roundtrips using HTMX. Zero heavy client-side bundles or
            complex JS compilation.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon workspace-icon">
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h4>Multi-Team Spaces</h4>
          <p>
            Organize separate workspaces, boards, and tasks with isolated database structures and
            team permission checks.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon wip-icon">
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
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h4>Smart WIP Limits</h4>
          <p>
            Configure column WIP limits to prevent bottlenecks and visually signal team overload
            states automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
