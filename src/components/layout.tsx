import type { PropsWithChildren } from '@kitajs/html';
import { alpine } from '../utils/html';

interface NavUser {
  avatarSeed: string;
  displayName: string;
}

export function Layout({
  title,
  user,
  children,
}: PropsWithChildren<{ title?: string; user?: NavUser }>) {
  return (
    <>
      {'<!DOCTYPE html>'}
      <html lang="en" data-theme="light">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title safe>{title || 'ClickDown'} | ClickDown</title>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="stylesheet" href="/vendor/pico.min.css" />
          <link rel="stylesheet" href="/css/custom.css" />
        </head>
        <body>
          <Header user={user} />
          <main class="container">{children}</main>

          {/* Toast container (toasts are appended by showToast in /js/app.js) */}
          <div class="toast-container" role="status" aria-live="polite"></div>

          <script defer src="/vendor/htmx.min.js"></script>
          <script defer src="/vendor/htmx-ws.min.js"></script>
          <script defer src="/js/app.js"></script>
          <script defer src="/vendor/alpine.min.js"></script>
        </body>
      </html>
    </>
  );
}

function Header({ user }: { user?: NavUser }) {
  return (
    <>
      <header class="container">
        <nav>
          <ul>
            <li>
              <strong>
                <a
                  href="/"
                  style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none;"
                >
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
                    style="color: var(--pico-primary);"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                  ClickDown
                </a>
              </strong>
            </li>
          </ul>
          <ul>
            <li>
              <button
                type="button"
                id="theme-toggle"
                class="outline secondary"
                aria-label="Toggle dark mode"
                onclick="toggleTheme()"
                style="padding: 0.4rem; border: none; background: transparent;"
              >
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
                  class="theme-icon-moon"
                  style="display: none;"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
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
                  class="theme-icon-sun"
                  style="display: none;"
                >
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              </button>
            </li>
            {user ? (
              <li>
                <div
                  class="user-dropdown-container"
                  x-data="{ open: false }"
                  {...alpine({ '@click.away': 'open = false' })}
                  style="position: relative;"
                >
                  <button
                    {...alpine({ '@click': 'open = !open' })}
                    class="user-dropdown-trigger"
                    type="button"
                    style="display: flex; align-items: center; gap: 0.5rem; background: transparent; border: none; padding: 0.25rem 0.5rem; margin: 0; color: var(--pico-color); cursor: pointer; font-size: 0.95rem; font-weight: 500;"
                  >
                    <img
                      src={`/api/avatar/${user.avatarSeed}?name=${encodeURIComponent(user.displayName)}`}
                      alt={user.displayName}
                      class="avatar-small"
                    />
                    <span safe>{user.displayName}</span>
                    <svg
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      style="transition: transform 0.2s ease; opacity: 0.6;"
                      {...alpine({ ':style': "open ? 'transform: rotate(180deg)' : ''" })}
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <div
                    class="user-dropdown-menu"
                    x-show="open"
                    {...alpine({
                      'x-transition:enter': 'transition ease-out duration-150',
                      'x-transition:enter-start': 'opacity-0 transform scale-95',
                      'x-transition:enter-end': 'opacity-100 transform scale-100',
                      'x-transition:leave': 'transition ease-in duration-100',
                      'x-transition:leave-start': 'opacity-100 transform scale-100',
                      'x-transition:leave-end': 'opacity-0 transform scale-95',
                    })}
                    style="display: none; position: absolute; right: 0; top: calc(100% + 8px); background: var(--pico-card-background-color); border: 1px solid var(--pico-border-color); border-radius: var(--pico-border-radius); box-shadow: var(--shadow-lg); min-width: 180px; z-index: 100; overflow: hidden; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);"
                  >
                    <ul style="list-style: none; margin: 0; padding: 0.25rem;">
                      <li style="margin: 0; padding: 0;">
                        <a
                          href="/dashboard"
                          style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; text-decoration: none; font-size: 0.9rem; border-radius: 4px; transition: all 0.15s ease;"
                          class="dropdown-item"
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
                          style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; text-decoration: none; font-size: 0.9rem; border-radius: 4px; transition: all 0.15s ease;"
                          class="dropdown-item"
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
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                          Profile Settings
                        </a>
                      </li>
                      <li style="margin: 0; padding: 0;">
                        <hr style="margin: 0.25rem 0; border: none; border-top: 1px solid var(--pico-border-color);" />
                      </li>
                      <li style="margin: 0; padding: 0;">
                        <form method="POST" action="/logout" style="margin: 0; padding: 0;">
                          <button
                            type="submit"
                            style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; width: 100%; background: none; border: none; font-size: 0.9rem; color: var(--pico-color); cursor: pointer; border-radius: 4px; transition: all 0.15s ease; font-family: inherit;"
                            class="dropdown-item danger"
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
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                              <polyline points="16 17 21 12 16 7"></polyline>
                              <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                            Logout
                          </button>
                        </form>
                      </li>
                    </ul>
                  </div>
                </div>
              </li>
            ) : (
              <>
                <li>
                  <a href="/login" class="secondary outline">
                    Login
                  </a>
                </li>
                <li>
                  <a href="/register">Register</a>
                </li>
              </>
            )}
          </ul>
        </nav>
      </header>
      <script>{`
        function toggleTheme() {
          const html = document.documentElement;
          const currentTheme = html.getAttribute('data-theme');
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          html.setAttribute('data-theme', newTheme);
          localStorage.setItem('theme', newTheme);
          updateThemeIcon(newTheme);
        }
        function updateThemeIcon(theme) {
          const moon = document.querySelector('.theme-icon-moon');
          const sun = document.querySelector('.theme-icon-sun');
          if (theme === 'dark') { moon.style.display = 'none'; sun.style.display = 'block'; }
          else { moon.style.display = 'block'; sun.style.display = 'none'; }
        }
        (function() {
          const savedTheme = localStorage.getItem('theme') || 'light';
          document.documentElement.setAttribute('data-theme', savedTheme);
          document.addEventListener('DOMContentLoaded', () => { updateThemeIcon(savedTheme); });
        })();
      `}</script>
    </>
  );
}
