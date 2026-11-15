import { expect, test } from '@playwright/test';
import { setupBoard } from './helpers';

const password = 'Password123!';

test.describe('Security features (new)', () => {
  test('login redirect returns the user to a deep-linked task after auth', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });
    const taskId = await page.locator('.task-card').first().getAttribute('data-task-id');
    expect(taskId).toBeTruthy();

    // Logout
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');

    // Unauthenticated task link → login with redirect
    await page.goto(`/tasks/${taskId}`);
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).toContain('redirect=');

    await page.fill('#email', `feat-${uid}@example.com`);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    // Should land back on the board with the task modal open (deep-link flow)
    await expect(page).toHaveURL(new RegExp(`/teams/feature-team-${uid}/boards/`), {
      timeout: 15000,
    });
    await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 15000 });
  });

  test('join page without token is rejected; slug-only join modal fails', async ({ page }) => {
    const uid = Date.now();
    const teamName = `Sec Team ${uid}`;
    const teamSlug = `sec-team-${uid}`;

    // Owner creates team
    await page.goto('/register');
    await page.fill('#displayName', `Owner ${uid}`);
    await page.fill('#email', `sec-owner-${uid}@example.com`);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}`));

    // Logout
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');

    // Joiner registers
    await page.goto('/register');
    await page.fill('#displayName', `Joiner ${uid}`);
    await page.fill('#email', `sec-joiner-${uid}@example.com`);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Direct join without token → invalid invite
    await page.goto(`/teams/${teamSlug}/join`);
    await expect(page.locator('body')).toContainText(/Invalid or expired invite/i);

    // Modal join with slug only (no token) → validation error
    await page.goto('/dashboard');
    await page.click('button:has-text("Join a Team")');
    const joinDialog = page.locator('dialog[open]');
    await expect(joinDialog).toBeVisible();
    await joinDialog.locator('#teamSlug').fill(teamSlug);
    await joinDialog.locator('button[type="submit"]:has-text("Join Team")').click();
    await expect(page.locator('.inline-error')).toContainText(/token|invite/i, {
      timeout: 10000,
    });
  });

  test('responses include security headers on HTML pages', async ({ page }) => {
    const res = await page.goto('/');
    expect(res).not.toBeNull();
    const headers = res?.headers() ?? {};
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  test('static path traversal is not served', async ({ request }) => {
    const res = await request.get('/css/../../package.json');
    expect(res.status()).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('"name": "clickdown"');
  });

  test('strict script-src CSP works cleanly with Alpine CSP and HTMX without violations', async ({
    page,
  }) => {
    const cspViolations: string[] = [];
    const pageErrors: string[] = [];

    await page.addInitScript(() => {
      const win = window as unknown as Record<string, string[]>;
      win.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        win.__cspViolations?.push(`${e.violatedDirective}: ${e.blockedURI}`);
      });
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const homeRes = await page.goto('/');
    expect(homeRes?.headers()['content-security-policy']).toMatch(/script-src 'self'(?:;|$)/);

    // Exercise theme toggle via delegated listener
    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Exercise Alpine CSP registerForm reactivity
    await page.goto('/register');
    await page.fill('#password', 'Short1!');
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await page.fill('#email', `csp-${Date.now()}@example.com`);
    await page.fill('#displayName', 'CSP Tester');
    await page.fill('#password', 'StrongPass1!');
    await page.fill('#confirmPassword', 'StrongPass1!');
    await expect(page.locator('button[type="submit"]')).toBeEnabled();

    const uid = Date.now() + 1;
    await setupBoard(page, uid, { withTask: true });

    // Open task detail modal and toggle Alpine Write/Preview + Close
    await page.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Preview' }).click();
    await expect(modal.locator('.markdown-preview')).toBeVisible();
    await modal.getByRole('button', { name: 'Write' }).click();
    await expect(modal.locator('#taskDescriptionInput')).toBeVisible();
    await modal.locator('.form-actions button:has-text("Close")').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    const violations = await page.evaluate(
      () => (window as unknown as Record<string, string[]>).__cspViolations || []
    );
    cspViolations.push(...violations);
    expect(cspViolations).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
