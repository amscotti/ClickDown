import { alpine } from '../../utils/html';

export function RegisterPage() {
  return (
    <>
      <div class="grid" style="place-items: center; min-height: 60vh;">
        <div style="max-width: 400px; width: 100%;">
          <hgroup style="text-align: center; margin-bottom: 2rem;">
            <h1>Create Account</h1>
            <h2>Join ClickDown today</h2>
          </hgroup>

          <form
            method="post"
            hx-post="/register"
            hx-target="#form-errors"
            hx-swap="innerHTML"
            x-data="registerForm()"
          >
            <div id="form-errors"></div>

            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              required
              placeholder="you@example.com"
              autocomplete="email"
              x-model="email"
              {...alpine({
                ':aria-invalid': "email === '' ? null : (email.includes('@') ? 'false' : 'true')",
              })}
            />

            <label for="displayName">Display Name</label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              required
              placeholder="John Doe"
              autocomplete="name"
              x-model="displayName"
              {...alpine({
                ':aria-invalid':
                  "displayName === '' ? null : (displayName.trim().length >= 2 ? 'false' : 'true')",
              })}
            />

            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              required
              minlength="8"
              placeholder="At least 8 characters"
              autocomplete="new-password"
              x-model="password"
              {...alpine({
                ':aria-invalid': "password === '' ? null : (isPasswordValid ? 'false' : 'true')",
              })}
            />

            {/* Live Password Strength Checklist */}
            <div
              class="password-requirements"
              style="font-size: 0.85rem; margin-top: -0.5rem; margin-bottom: 1.2rem; color: var(--pico-muted-color);"
            >
              <div style="display: flex; flex-direction: column; gap: 0.2rem; padding: 0.25rem 0.5rem; background: var(--pico-card-background-color, rgba(0,0,0,0.03)); border-radius: 4px;">
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

            <label for="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              required
              minlength="8"
              placeholder="Same as password"
              autocomplete="new-password"
              x-model="confirmPassword"
              {...alpine({
                ':aria-invalid':
                  "confirmPassword === '' ? null : (passwordsMatch ? 'false' : 'true')",
              })}
            />
            <span
              x-show="confirmPassword !== '' && !passwordsMatch"
              style="display: block; font-size: 0.85rem; color: var(--pico-color-danger); margin-top: -0.5rem; margin-bottom: 1rem;"
            >
              ❌ Passwords do not match
            </span>
            <span
              x-show="confirmPassword !== '' && passwordsMatch"
              style="display: block; font-size: 0.85rem; color: var(--pico-color-success); margin-top: -0.5rem; margin-bottom: 1rem;"
            >
              ✓ Passwords match
            </span>

            <button
              type="submit"
              class="htmx-indicator-button"
              {...alpine({ ':disabled': '!canSubmit' })}
            >
              <span class="btn-text">Create Account</span>
              <span class="htmx-indicator spinner" style="display: none;">
                {' '}
                ⏳
              </span>
            </button>

            <small style="display: block; text-align: center; margin-top: 1rem;">
              Already have an account? <a href="/login">Login</a>
            </small>
          </form>
        </div>
      </div>

      <script>{`
        function registerForm() {
          return {
            email: '',
            displayName: '',
            password: '',
            confirmPassword: '',

            get passwordsMatch() {
              return this.password === this.confirmPassword;
            },

            get isPasswordValid() {
              return this.password.length >= 8 &&
                     /[a-z]/.test(this.password) &&
                     /[A-Z]/.test(this.password) &&
                     /\\d/.test(this.password) &&
                     /[^a-zA-Z0-9]/.test(this.password);
            },

            get canSubmit() {
              return this.email.includes('@') &&
                     this.displayName.trim().length >= 2 &&
                     this.isPasswordValid &&
                     this.passwordsMatch;
            }
          }
        }
      `}</script>
    </>
  );
}
