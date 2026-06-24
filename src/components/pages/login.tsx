export function LoginPage({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  return (
    <div class="grid" style="place-items: center; min-height: 60vh;">
      <div style="max-width: 400px; width: 100%;">
        <hgroup style="text-align: center; margin-bottom: 2rem;">
          <h1>Welcome Back</h1>
          <h2>Login to ClickDown</h2>
        </hgroup>

        <form method="post" hx-post="/login" hx-target="#form-errors" hx-swap="innerHTML">
          <div id="form-errors"></div>

          <input type="hidden" name="redirect" value={redirectTo} />

          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            placeholder="you@example.com"
            autocomplete="email"
          />

          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            required
            placeholder="Enter your password"
            autocomplete="current-password"
          />

          <button type="submit" class="htmx-indicator-button">
            <span class="btn-text">Login</span>
            <span class="htmx-indicator spinner" style="display: none;">
              {' '}
              ⏳
            </span>
          </button>

          <small style="display: block; text-align: center; margin-top: 1rem;">
            Don't have an account? <a href="/register">Register</a>
          </small>
        </form>
      </div>
    </div>
  );
}
