import { expect, test } from '@playwright/test';

test.describe('ClickDown E2E Team Collaboration', () => {
  const testPassword = 'Password123!';

  test('should rename a team and board through their edit modals and refresh slugs', async ({
    page,
  }) => {
    const uniqueId = Date.now();
    const teamName = `Collab Team ${uniqueId}`;
    const renamedTeam = `Renamed Team ${uniqueId}`;
    const boardName = `Collab Board ${uniqueId}`;
    const renamedBoard = `Renamed Board ${uniqueId}`;

    // Register + create team + board
    await page.goto('/register');
    await page.fill('#displayName', 'Alex Collab');
    await page.fill('#email', `collab-owner-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(/\/teams\//);

    await page.click('text=Create Board');
    await expect(page.locator('#boardName')).toBeVisible();
    await page.fill('#boardName', boardName);
    await Promise.all([
      page.waitForURL(/\/boards\//, { timeout: 20000 }),
      page.click('button[type="submit"]:has-text("Create Board")'),
    ]);
    await expect(page).toHaveURL(/\/boards\//);

    // 1. Rename the board
    await page.click('text=Edit Board');
    const boardEditDialog = page.locator('dialog[open]');
    await expect(boardEditDialog).toBeVisible();
    await boardEditDialog.locator('#boardName').fill(renamedBoard);
    await boardEditDialog.locator('button[type="submit"]:has-text("Save Changes")').click();
    await expect(page).toHaveURL(/\/renamed-board-/);

    await expect(page.locator('.board-header h1')).toContainText(renamedBoard);

    // 2. Rename the team
    await page.goto(`/teams/collab-team-${uniqueId}`);
    await expect(page.locator('.team-header h1')).toContainText(teamName);

    await page.click('text=Edit Team');
    const teamEditDialog = page.locator('dialog[open]');
    await expect(teamEditDialog).toBeVisible();
    await teamEditDialog.locator('#teamName').fill(renamedTeam);
    await teamEditDialog.locator('button[type="submit"]:has-text("Save Changes")').click();
    await expect(page).toHaveURL(/\/renamed-team-/);

    await expect(page.locator('.team-header h1')).toContainText(renamedTeam);
    // Board should still be listed on the renamed team page
    await expect(page.locator('.boards-grid')).toContainText(renamedBoard);
  });

  test('should generate an invite link containing the team slug in the invite modal', async ({
    page,
  }) => {
    const uniqueId = Date.now();
    const teamName = `Invite Team ${uniqueId}`;

    await page.goto('/register');
    await page.fill('#displayName', 'Alex Invite');
    await page.fill('#email', `invite-owner-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(/\/teams\/invite-team-/);

    // Open the invite modal
    await page.click('text=Invite Members');
    const inviteDialog = page.locator('dialog[open]');
    await expect(inviteDialog).toBeVisible();
    await expect(inviteDialog.locator('h3')).toContainText('Invite Members');

    const inviteValue = await inviteDialog.locator('#invite-link').inputValue();
    expect(inviteValue).toContain('/teams/invite-team-');
    expect(inviteValue).toContain('/join?token=');
  });

  test('should let a second user join a team via the "Join a Team" invite-link modal', async ({
    page,
  }) => {
    const uniqueId = Date.now();
    const teamName = `Shared Team ${uniqueId}`;

    // User A creates the team
    await page.goto('/register');
    await page.fill('#displayName', 'Owner Alpha');
    await page.fill('#email', `shared-owner-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(/\/teams\/shared-team-/);

    const teamSlug = `shared-team-${uniqueId}`;

    // Capture full invite link (includes token)
    await page.click('text=Invite Members');
    const inviteLink = await page.locator('#invite-link').inputValue();
    await page.locator('dialog[open] button:has-text("Done")').click();

    // Logout
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');

    // User B registers
    await page.click('text=Register');
    await page.fill('#displayName', 'Member Beta');
    await page.fill('#email', `shared-member-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Join via full invite link (slug alone is not enough)
    await page.click('button:has-text("Join a Team")');
    const joinDialog = page.locator('dialog[open]');
    await expect(joinDialog).toBeVisible();
    await joinDialog.locator('#teamSlug').fill(inviteLink);
    await joinDialog.locator('button[type="submit"]:has-text("Join Team")').click();
    await page.waitForLoadState('networkidle');

    // Should land on the team page as a member (2 members now)
    await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}`));
    await expect(page.locator('.team-header h1')).toContainText(teamName);
    await expect(page.locator('.team-meta')).toContainText('2 members');
  });

  test('should render the public invite confirmation page and let a non-member join via it', async ({
    page,
  }) => {
    const uniqueId = Date.now();
    const teamName = `Link Team ${uniqueId}`;
    const teamSlug = `link-team-${uniqueId}`;

    // User A creates the team
    await page.goto('/register');
    await page.fill('#displayName', 'Link Owner');
    await page.fill('#email', `link-owner-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}`));

    // Capture invite link with token
    await page.click('text=Invite Members');
    const inviteLink = await page.locator('#invite-link').inputValue();
    await page.locator('dialog[open] button:has-text("Done")').click();
    const invitePath = new URL(inviteLink).pathname + new URL(inviteLink).search;

    // An already-member visiting the join page should be redirected to the team page
    await page.goto(invitePath);
    await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}$`));

    // Logout so a fresh user can use the invite page
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');

    // User B registers
    await page.goto('/register');
    await page.fill('#displayName', 'Link Joiner');
    await page.fill('#email', `link-joiner-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Visit the public invite link directly — should show the join confirmation page
    await page.goto(invitePath);
    await expect(page.locator('.join-team-card')).toBeVisible();
    await expect(page.locator('.join-team-card h2')).toContainText(teamName);

    // Confirm joining
    await page.click('button[type="submit"]:has-text("Join Team")');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}$`));
    await expect(page.locator('.team-header h1')).toContainText(teamName);
    await expect(page.locator('.team-meta')).toContainText('2 members');
  });
});
