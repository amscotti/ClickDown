import { expect, test } from '@playwright/test';

test.describe('ClickDown E2E Navigation & Access Control', () => {
  const testPassword = 'Password123!';

  test.describe('Authentication redirects for protected routes', () => {
    const protectedRoutes = [
      '/dashboard',
      '/profile',
      '/teams/some-team',
      '/teams/some-team/boards/some-board',
    ];

    for (const route of protectedRoutes) {
      test(`unauthenticated visit to ${route} redirects to /login`, async ({ page }) => {
        const response = await page.goto(route);
        // Server returns a 302; Playwright follows to /login
        expect(response?.url()).toContain('/login');
        await expect(page).toHaveURL('/login');
      });
    }

    test('invite join page redirects unauthenticated users to login with a return path', async ({
      page,
    }) => {
      const uniqueId = Date.now();
      const teamName = `Join Redirect Team ${uniqueId}`;
      const teamSlug = `join-redirect-team-${uniqueId}`;

      // Create a team so the slug resolves (the join route checks team existence first)
      await page.goto('/register');
      await page.fill('#displayName', 'Join Redirect Owner');
      await page.fill('#email', `jr-owner-${uniqueId}@example.com`);
      await page.fill('#password', testPassword);
      await page.fill('#confirmPassword', testPassword);
      await page.click('button[type="submit"]');

      await page.click('text=Create Your First Team');
      await page.fill('#teamName', teamName);
      await page.click('button[type="submit"]:has-text("Create Team")');
      await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}`));

      // Grab the invite link (includes secret token)
      await page.click('text=Invite Members');
      const inviteLink = await page.locator('#invite-link').inputValue();
      await page.locator('dialog[open] button:has-text("Done")').click();

      // Logout, then visit the invite link while unauthenticated
      await page.click('.user-dropdown-trigger');
      await page.click('text=Logout');
      await expect(page).toHaveURL('/');

      const invitePath = new URL(inviteLink).pathname + new URL(inviteLink).search;
      await page.goto(invitePath);
      await expect(page).toHaveURL(/\/login/);
      expect(page.url()).toContain('redirect=');
      expect(decodeURIComponent(page.url())).toContain('token=');
    });
  });

  test.describe('Access control between users', () => {
    test('a logged-in non-member is denied access to another team and its board', async ({
      page,
    }) => {
      const uniqueId = Date.now();
      const teamName = `Private Team ${uniqueId}`;
      const teamSlug = `private-team-${uniqueId}`;
      const boardName = `Private Board ${uniqueId}`;
      const boardSlug = `private-board-${uniqueId}`;

      // Owner creates a team + board
      await page.goto('/register');
      await page.fill('#displayName', 'Private Owner');
      await page.fill('#email', `private-owner-${uniqueId}@example.com`);
      await page.fill('#password', testPassword);
      await page.fill('#confirmPassword', testPassword);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL('/dashboard');

      await page.click('text=Create Your First Team');
      await page.fill('#teamName', teamName);
      await page.click('button[type="submit"]:has-text("Create Team")');
      await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}`));

      await page.click('text=Create Board');
      await page.fill('#boardName', boardName);
      await page.click('button[type="submit"]:has-text("Create Board")');
      await expect(page).toHaveURL(new RegExp(`/boards/${boardSlug}`));

      // Logout, register a second unrelated user
      await page.click('.user-dropdown-trigger');
      await page.click('text=Logout');
      await expect(page).toHaveURL('/');

      await page.goto('/register');
      await page.fill('#displayName', 'Outsider');
      await page.fill('#email', `outsider-${uniqueId}@example.com`);
      await page.fill('#password', testPassword);
      await page.fill('#confirmPassword', testPassword);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL('/dashboard');

      // The team should NOT appear in this user's team list
      const teamListResponse = await page.request.get('/teams/list');
      expect(await teamListResponse.text()).not.toContain(teamName);

      // Directly visiting the team should show access denied
      const teamResponse = await page.goto(`/teams/${teamSlug}`);
      expect(teamResponse?.status()).toBe(403);
      await expect(page.locator('body')).toContainText('do not have access');

      // Directly visiting the board should show access denied
      const boardResponse = await page.goto(`/teams/${teamSlug}/boards/${boardSlug}`);
      expect(boardResponse?.status()).toBe(403);
      await expect(page.locator('body')).toContainText('do not have access');
    });
  });

  test.describe('404 / not found handling', () => {
    test('visiting a non-existent team renders the error page', async ({ page }) => {
      // Register quickly to get past the auth gate
      const uniqueId = Date.now();
      await page.goto('/register');
      await page.fill('#displayName', 'NotFound User');
      await page.fill('#email', `nf-${uniqueId}@example.com`);
      await page.fill('#password', testPassword);
      await page.fill('#confirmPassword', testPassword);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL('/dashboard');

      const response = await page.goto(`/teams/this-team-does-not-exist-${uniqueId}`);
      expect(response?.status()).toBe(404);
      await expect(page.locator('body')).toContainText('not found');
    });

    test('visiting a non-existent board renders the error page', async ({ page }) => {
      const uniqueId = Date.now();
      const teamName = `Host Team ${uniqueId}`;
      const teamSlug = `host-team-${uniqueId}`;

      await page.goto('/register');
      await page.fill('#displayName', 'Host User');
      await page.fill('#email', `host-${uniqueId}@example.com`);
      await page.fill('#password', testPassword);
      await page.fill('#confirmPassword', testPassword);
      await page.click('button[type="submit"]');

      await page.click('text=Create Your First Team');
      await page.fill('#teamName', teamName);
      await page.click('button[type="submit"]:has-text("Create Team")');
      await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}`));

      const response = await page.goto(`/teams/${teamSlug}/boards/no-such-board-${uniqueId}`);
      expect(response?.status()).toBe(404);
      await expect(page.locator('body')).toContainText('not found');
    });
  });
});
