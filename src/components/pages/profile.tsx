import type { PropsWithChildren } from '@kitajs/html';
import type { ApiToken } from '../../services/token.service';
import { alpine } from '../../utils/html';

interface ProfilePageProps {
  user: { avatarSeed: string; displayName: string; email: string };
  tokens?: ApiToken[];
  /** Newly created token, shown exactly once. */
  newToken?: string;
  /** Absolute MCP endpoint URL shown in setup instructions (e.g. http://localhost:3000/api/mcp). */
  mcpUrl?: string;
}

export function ProfilePage({
  user,
  tokens = [],
  newToken,
  mcpUrl = 'http://localhost:3000/api/mcp',
}: PropsWithChildren<ProfilePageProps>) {
  return (
    <>
      <div class="dashboard">
        <aside class="sidebar">
          <div class="user-info">
            <img
              src={`/api/avatar/${user.avatarSeed}?name=${encodeURIComponent(user.displayName)}`}
              alt={user.displayName}
              class="avatar-large"
            />
            <div>
              <strong safe>{user.displayName}</strong>
              <br />
              <small safe>{user.email}</small>
            </div>
          </div>

          <nav>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem;">
              <li style="margin: 0; padding: 0;">
                <a
                  href="/dashboard"
                  class="secondary"
                  style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none; padding: 0.5rem 0.75rem; border-radius: 4px; color: var(--pico-color); transition: background 0.15s ease;"
                >
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="3" y="3" width="7" height="9"></rect>
                    <rect x="14" y="3" width="7" height="5"></rect>
                    <rect x="14" y="12" width="7" height="9"></rect>
                    <rect x="3" y="16" width="7" height="5"></rect>
                  </svg>
                  Dashboard
                </a>
              </li>
              <li style="margin: 0; padding: 0;">
                <a
                  href="/profile"
                  class="active"
                  style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none; padding: 0.5rem 0.75rem; border-radius: 4px; background: rgba(99, 102, 241, 0.15); color: var(--primary-400); font-weight: 500;"
                >
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  Profile Settings
                </a>
              </li>
            </ul>
          </nav>
        </aside>

        <section
          class="content"
          style="padding: 2rem; max-width: 800px; width: 100%; overflow-y: auto;"
        >
          <hgroup style="margin-bottom: 2rem;">
            <h1 style="margin: 0; font-size: 2rem; font-weight: 700; color: var(--pico-color);">
              Profile Settings
            </h1>
            <p style="color: var(--pico-muted-color); font-size: 0.95rem; margin-top: 0.25rem;">
              Manage your account details and security settings
            </p>
          </hgroup>

          <div
            class="card"
            style="margin-bottom: 2rem; padding: 2rem; border-radius: var(--pico-border-radius); background: var(--pico-card-background-color); border: 1px solid var(--pico-border-color); box-shadow: var(--shadow-sm);"
          >
            <h3 style="font-size: 1.25rem; margin-top: 0; margin-bottom: 1.5rem; font-weight: 600; color: var(--pico-color); display: flex; align-items: center; gap: 0.5rem;">
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--pico-primary);"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              Personal Information
            </h3>

            <form method="post" hx-post="/profile" hx-target="#profile-errors" hx-swap="innerHTML">
              <div id="profile-errors"></div>

              <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--pico-border-color);">
                <img
                  src={`/api/avatar/${user.avatarSeed}?name=${encodeURIComponent(user.displayName)}`}
                  alt={user.displayName}
                  style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid var(--pico-primary);"
                />
                <div>
                  <h4 safe style="margin: 0; font-size: 1.1rem; font-weight: 600;">
                    {user.displayName}
                  </h4>
                  <span style="font-size: 0.85rem; color: var(--pico-muted-color);">
                    Your avatar is dynamically generated based on your display name initials.
                  </span>
                </div>
              </div>

              <div class="grid">
                <div>
                  <label for="displayName" style="font-weight: 500;">
                    Display Name
                  </label>
                  <input
                    type="text"
                    id="displayName"
                    name="displayName"
                    value={user.displayName}
                    required
                    minlength="2"
                    maxlength="50"
                  />
                </div>

                <div>
                  <label for="email" style="font-weight: 500;">
                    Email Address
                  </label>
                  <input type="email" id="email" name="email" value={user.email} required />
                </div>
              </div>

              <label for="profileCurrentPassword" style="font-weight: 500;">
                Current Password <small>(required only when changing email)</small>
              </label>
              <input
                type="password"
                id="profileCurrentPassword"
                name="currentPassword"
                autocomplete="current-password"
              />

              <div style="margin-top: 1rem; display: flex; justify-content: flex-end;">
                <button
                  type="submit"
                  style="margin: 0; padding: 0.75rem 1.5rem; font-size: 0.95rem; font-weight: 600;"
                >
                  Save Profile Details
                </button>
              </div>
            </form>
          </div>

          <div
            class="card"
            style="padding: 2rem; border-radius: var(--pico-border-radius); background: var(--pico-card-background-color); border: 1px solid var(--pico-border-color); box-shadow: var(--shadow-sm);"
            x-data="passwordChangeForm()"
          >
            <h3 style="font-size: 1.25rem; margin-top: 0; margin-bottom: 1.5rem; font-weight: 600; color: var(--pico-color); display: flex; align-items: center; gap: 0.5rem;">
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--pico-color-success);"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Change Password
            </h3>

            <form method="post" hx-post="/profile" hx-target="#password-errors" hx-swap="innerHTML">
              <div id="password-errors"></div>

              <label for="currentPassword" style="font-weight: 500;">
                Current Password
              </label>
              <input
                type="password"
                id="currentPassword"
                name="currentPassword"
                placeholder="Enter your current password"
                autocomplete="current-password"
                required
              />

              <div class="grid">
                <div>
                  <label for="password" style="font-weight: 500;">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="At least 8 characters"
                    autocomplete="new-password"
                    x-model="password"
                    {...alpine({
                      ':aria-invalid':
                        "password === '' ? null : (isPasswordValid ? 'false' : 'true')",
                    })}
                  />
                </div>

                <div>
                  <label for="confirmPassword" style="font-weight: 500;">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    placeholder="Confirm your new password"
                    autocomplete="new-password"
                    x-model="confirmPassword"
                    {...alpine({
                      ':aria-invalid':
                        "confirmPassword === '' ? null : (passwordsMatch ? 'false' : 'true')",
                    })}
                  />
                </div>
              </div>

              <div x-show="password !== ''" style="margin-top: -0.5rem; margin-bottom: 1.5rem;">
                <div
                  class="password-requirements"
                  style="font-size: 0.85rem; color: var(--pico-muted-color);"
                >
                  <div style="display: flex; flex-direction: column; gap: 0.2rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.15); border-radius: 4px; border: 1px solid var(--pico-border-color);">
                    <span
                      {...alpine({
                        ':style':
                          "password.length >= 8 ? 'color: var(--pico-color-success);' : 'color: var(--pico-muted-color);'",
                      })}
                    >
                      <span x-text="password.length >= 8 ? '✓' : '○'"></span> At least 8 characters
                    </span>
                    <span
                      {...alpine({
                        ':style':
                          "/[a-z]/.test(password) ? 'color: var(--pico-color-success);' : 'color: var(--pico-muted-color);'",
                      })}
                    >
                      <span x-text="/[a-z]/.test(password) ? '✓' : '○'"></span> One lowercase letter
                    </span>
                    <span
                      {...alpine({
                        ':style':
                          "/[A-Z]/.test(password) ? 'color: var(--pico-color-success);' : 'color: var(--pico-muted-color);'",
                      })}
                    >
                      <span x-text="/[A-Z]/.test(password) ? '✓' : '○'"></span> One uppercase letter
                    </span>
                    <span
                      {...alpine({
                        ':style':
                          "/\\d/.test(password) ? 'color: var(--pico-color-success);' : 'color: var(--pico-muted-color);'",
                      })}
                    >
                      <span x-text="/\\d/.test(password) ? '✓' : '○'"></span> One number
                    </span>
                    <span
                      {...alpine({
                        ':style':
                          "/[^a-zA-Z0-9]/.test(password) ? 'color: var(--pico-color-success);' : 'color: var(--pico-muted-color);'",
                      })}
                    >
                      <span x-text="/[^a-zA-Z0-9]/.test(password) ? '✓' : '○'"></span> One special
                      character
                    </span>
                  </div>
                </div>

                <div style="margin-top: 0.5rem;">
                  <span
                    x-show="confirmPassword !== '' && !passwordsMatch"
                    style="display: block; font-size: 0.85rem; color: var(--pico-color-danger);"
                  >
                    ❌ Passwords do not match
                  </span>
                  <span
                    x-show="confirmPassword !== '' && passwordsMatch"
                    style="display: block; font-size: 0.85rem; color: var(--pico-color-success);"
                  >
                    ✓ Passwords match
                  </span>
                </div>
              </div>

              <div style="margin-top: 1rem; display: flex; justify-content: flex-end;">
                <button
                  type="submit"
                  style="margin: 0; padding: 0.75rem 1.5rem; font-size: 0.95rem; font-weight: 600;"
                  {...alpine({ ':disabled': "password === '' || !canSubmit" })}
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>

          <div
            class="card"
            style="margin-top: 2rem; padding: 2rem; border-radius: var(--pico-border-radius); background: var(--pico-card-background-color); border: 1px solid var(--pico-border-color); box-shadow: var(--shadow-sm);"
          >
            <h3 style="font-size: 1.25rem; margin-top: 0; margin-bottom: 0.5rem; font-weight: 600; color: var(--pico-color); display: flex; align-items: center; gap: 0.5rem;">
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--pico-primary);"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <path d="M7 8h10M7 12h6M7 16h8"></path>
              </svg>
              API Tokens (MCP)
            </h3>
            <p style="font-size: 0.85rem; color: var(--pico-muted-color); margin-bottom: 1rem;">
              Tokens let AI agents use the MCP endpoint at <code>POST /api/mcp</code> to read and
              manage tasks as you. Treat tokens like passwords.
            </p>

            <details style="margin-bottom: 1.5rem; font-size: 0.85rem;">
              <summary style="cursor: pointer; font-weight: 600; color: var(--pico-primary);">
                Setup: connect Claude Code (or another MCP client)
              </summary>
              <div style="margin-top: 0.75rem; padding: 1rem; border: 1px solid var(--pico-border-color); border-radius: var(--pico-border-radius); background: var(--pico-background-color);">
                <p style="margin-top: 0;">
                  <strong>1.</strong> Create a token below and copy it.
                </p>
                <p>
                  <strong>2.</strong> In a terminal, register ClickDown with Claude Code:
                </p>
                <pre style="padding: 0.75rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem;">
                  <code>{`claude mcp add --transport http clickdown ${mcpUrl} \\
  --header "Authorization: Bearer &lt;your-token&gt;"`}</code>
                </pre>
                <p>
                  <strong>3.</strong> In Claude Code, run <code>/mcp</code> to verify the
                  connection. The agent can then find tasks, update them, move them between columns,
                  and leave comments.
                </p>
                <p style="margin-bottom: 0;">
                  <strong>Other MCP clients:</strong> use the HTTP transport with URL{' '}
                  <code safe>{mcpUrl}</code> and header{' '}
                  <code safe>{'Authorization: Bearer <your-token>'}</code>. For config-file based
                  clients:
                </p>
                <pre style="padding: 0.75rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem;">
                  <code>{`{
  "mcpServers": {
    "clickdown": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer &lt;your-token&gt;" }
    }
  }
}`}</code>
                </pre>
              </div>
            </details>

            {newToken && (
              <div
                role="alert"
                style="margin-bottom: 1.5rem; padding: 1rem; border-radius: var(--pico-border-radius); background: rgba(16, 185, 129, 0.08); border: 1px solid var(--pico-color-success);"
              >
                <strong style="display: block; margin-bottom: 0.5rem; color: var(--pico-color-success);">
                  Token created — copy it now, it won't be shown again.
                </strong>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem;">
                  <code
                    id="new-api-token"
                    style="flex: 1; padding: 0.5rem 0.75rem; background: var(--pico-background-color); border: 1px solid var(--pico-border-color); border-radius: 4px; font-size: 0.85rem; word-break: break-all;"
                    safe
                  >
                    {newToken}
                  </code>
                  <button
                    type="button"
                    class="secondary outline"
                    style="white-space: nowrap; margin: 0;"
                    onclick="navigator.clipboard.writeText(document.getElementById('new-api-token').textContent).then(() => { this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 2000); })"
                  >
                    Copy
                  </button>
                </div>
                <strong style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem;">
                  Connect Claude Code in one step:
                </strong>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                  <code
                    id="new-token-command"
                    style="flex: 1; padding: 0.5rem 0.75rem; background: var(--pico-background-color); border: 1px solid var(--pico-border-color); border-radius: 4px; font-size: 0.8rem; word-break: break-all;"
                    safe
                  >{`claude mcp add --transport http clickdown ${mcpUrl} --header "Authorization: Bearer ${newToken}"`}</code>
                  <button
                    type="button"
                    class="secondary outline"
                    style="white-space: nowrap; margin: 0;"
                    onclick="navigator.clipboard.writeText(document.getElementById('new-token-command').textContent).then(() => { this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 2000); })"
                  >
                    Copy
                  </button>
                </div>
                <small style="display: block; margin-top: 0.5rem; color: var(--pico-muted-color);">
                  Run this in a terminal, then use /mcp inside Claude Code to verify.
                </small>
              </div>
            )}

            <form
              method="post"
              action="/profile/tokens"
              style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem;"
            >
              <input
                type="text"
                name="name"
                placeholder="Token name (e.g. claude-code)"
                required
                maxlength="60"
                style="flex: 1; margin: 0;"
              />
              <button type="submit" style="margin: 0; white-space: nowrap; width: auto;">
                Create Token
              </button>
            </form>

            {tokens.length === 0 ? (
              <p style="font-size: 0.9rem; color: var(--pico-muted-color); margin: 0;">
                No tokens yet. Create one to connect an AI agent.
              </p>
            ) : (
              <table style="margin: 0; font-size: 0.9rem;">
                <thead>
                  <tr>
                    <th style="padding: 0.5rem;">Name</th>
                    <th style="padding: 0.5rem;">Token</th>
                    <th style="padding: 0.5rem;">Last used</th>
                    <th style="padding: 0.5rem;">Created</th>
                    <th style="padding: 0.5rem;"></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr>
                      <td style="padding: 0.5rem;" safe>
                        {t.name}
                      </td>
                      <td style="padding: 0.5rem;">
                        <code safe>{t.prefix}…</code>
                      </td>
                      <td style="padding: 0.5rem; color: var(--pico-muted-color);">
                        {t.lastUsedAt ? t.lastUsedAt.toLocaleString() : 'Never'}
                      </td>
                      <td style="padding: 0.5rem; color: var(--pico-muted-color);">
                        {t.createdAt.toLocaleDateString()}
                      </td>
                      <td style="padding: 0.5rem;">
                        <button
                          type="button"
                          class="secondary outline"
                          style="margin: 0; padding: 0.25rem 0.75rem; font-size: 0.8rem; color: var(--color-danger); border-color: var(--color-danger);"
                          hx-post={`/profile/tokens/${t.id}/revoke`}
                          hx-confirm="Revoke this token? Agents using it will lose access immediately."
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <script>{`
        function passwordChangeForm() {
          return {
            password: '',
            confirmPassword: '',
            get isPasswordValid() {
              const p = this.password;
              return p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\\d/.test(p) && /[^a-zA-Z0-9]/.test(p);
            },
            get passwordsMatch() {
              return this.password === this.confirmPassword;
            },
            get canSubmit() {
              return this.isPasswordValid && this.passwordsMatch;
            }
          }
        }
      `}</script>
    </>
  );
}
