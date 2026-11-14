/**
 * E2E coverage for user-facing features added in the residual review pass:
 * comments, labels, attachments, archive purge, invite regenerate, admin RBAC UI.
 */
import { expect, type Page, test } from '@playwright/test';
import { setupBoard } from './helpers';

const password = 'Password123!';

async function openFirstTask(page: Page) {
  await page.locator('.task-card').first().click();
  const modal = page.locator('dialog[open]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  return modal;
}

async function acceptNextDialog(page: Page) {
  page.once('dialog', (d) => d.accept());
}

test.describe('Task comments, labels, attachments', () => {
  test('user can add a comment on a task', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });
    const modal = await openFirstTask(page);

    await modal.locator('textarea[name="body"]').fill(`Comment from E2E ${uid}`);
    await modal.locator('button:has-text("Comment")').click();

    await expect(modal.locator('#task-comments .task-comment')).toContainText(
      `Comment from E2E ${uid}`,
      { timeout: 10000 }
    );
    await expect(modal.locator('#task-comments .task-comment strong')).toContainText(`User ${uid}`);
  });

  test('user can add a label to a task', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });
    const modal = await openFirstTask(page);

    await modal.locator('input[name="name"][placeholder="New label name"]').fill(`Bug-${uid}`);
    await modal.locator('button:has-text("Add label")').click();

    await expect(modal.locator('#task-labels-list .task-label')).toContainText(`Bug-${uid}`, {
      timeout: 10000,
    });
  });

  test('user can upload an attachment and see it listed', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });
    const modal = await openFirstTask(page);

    const fileName = `e2e-note-${uid}.txt`;
    await modal.locator('input[type="file"][name="file"]').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`attachment body ${uid}`),
    });
    await modal.locator('button:has-text("Upload")').click();

    await expect(modal.locator('#task-attachments')).toContainText(fileName, { timeout: 15000 });
    await expect(modal.locator(`#task-attachments a[href*="/attachments/"]`)).toBeVisible();
  });
});

test.describe('Archive recycle bin', () => {
  test('archive task, show archived, permanently delete forever', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });
    await expect(page.locator('.task-card')).toHaveCount(1);

    const modal = await openFirstTask(page);
    // Wait for archive request so the card OOB-delete can land
    const archiveResp = page.waitForResponse(
      (r) => r.url().includes('/archive') && r.request().method() === 'POST'
    );
    await modal.locator('button:has-text("Archive")').click();
    await archiveResp;
    await expect(page.locator('.task-card')).toHaveCount(0, { timeout: 15000 });

    // Open archive (recycle bin)
    await page.locator('a.board-btn', { hasText: /Archived/ }).click();
    await expect(page).toHaveURL(/archived=true/);
    await expect(page.locator('.task-card')).toHaveCount(1, { timeout: 15000 });

    await openFirstTask(page);
    await acceptNextDialog(page);
    const purgeResp = page.waitForResponse(
      (r) => r.url().includes('/purge') && r.request().method() === 'POST'
    );
    await page.locator('dialog[open] button:has-text("Delete forever")').click();
    await purgeResp;

    await expect(page.locator('.task-card')).toHaveCount(0, { timeout: 15000 });
  });

  test('admin can empty the entire archive from the board toolbar', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });

    const modal = await openFirstTask(page);
    await modal.locator('button:has-text("Archive")').click();
    await expect(page.locator('.task-card')).toHaveCount(0, { timeout: 15000 });

    // Toolbar should reflect archived count
    await expect(page.locator('a.board-btn', { hasText: /Archived\s*\(/ })).toBeVisible({
      timeout: 10000,
    });

    await page.locator('a.board-btn', { hasText: /Archived/ }).click();
    await expect(page).toHaveURL(/archived=true/);
    await expect(page.locator('.task-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("Empty archive")')).toBeVisible();

    await acceptNextDialog(page);
    await page.locator('button:has-text("Empty archive")').click();

    // After purge, redirect off archived view with no cards
    await expect(page.locator('.task-card')).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator('button:has-text("Empty archive")')).toHaveCount(0);
  });
});

test.describe('Invite link regenerate', () => {
  test('regenerating invite invalidates the previous token', async ({ page }) => {
    const uid = Date.now();
    const teamSlug = `regen-team-${uid}`;

    await page.goto('/register');
    await page.fill('#displayName', `Owner Regen ${uid}`);
    await page.fill('#email', `owner-regen-${uid}@example.com`);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', `Regen Team ${uid}`);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(new RegExp(`/teams/${teamSlug}`));

    await page.click('text=Invite Members');
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    const oldLink = await dialog.locator('#invite-link').inputValue();
    expect(oldLink).toContain('token=');
    const oldToken = new URL(oldLink).searchParams.get('token');
    expect(oldToken).toBeTruthy();

    await acceptNextDialog(page);
    await dialog.locator('button:has-text("Regenerate invite link")').click();
    await expect(dialog.locator('.inline-success')).toContainText(/regenerated|no longer work/i, {
      timeout: 10000,
    });

    // Verify in-place outerHTML swap of #invite-link-section preserved Copy button & outer #invite-section
    await expect(dialog.locator('#invite-link')).toBeVisible();
    await expect(dialog.locator('button:has-text("Copy")')).toBeVisible();
    await expect(dialog).toContainText('Share this link');
    await expect(dialog.locator('button:has-text("Regenerate invite link")')).toBeVisible();

    const newLink = await dialog.locator('#invite-link').inputValue();
    expect(newLink).toContain('token=');
    const newToken = new URL(newLink).searchParams.get('token');
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    await page.locator('dialog[open] button:has-text("Done")').click();
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');

    await page.goto('/register');
    await page.fill('#displayName', `Joiner Regen ${uid}`);
    await page.fill('#email', `joiner-regen-${uid}@example.com`);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    expect(oldToken).toBeTruthy();
    await page.goto(`/teams/${teamSlug}/join?token=${encodeURIComponent(oldToken ?? '')}`);
    await expect(page.locator('body')).toContainText(/Invalid or expired invite/i, {
      timeout: 10000,
    });
  });
});

test.describe('Board admin RBAC (user-visible)', () => {
  test('team member does not see Edit Board or Add Column; owner does', async ({
    page,
    browser,
  }) => {
    const uid = Date.now();
    const { teamSlug, boardSlug } = await setupBoard(page, uid, { withTask: false });

    // Owner sees admin controls
    await expect(page.locator('button:has-text("Edit Board")')).toBeVisible();
    await expect(page.locator('button:has-text("+ Add Column")')).toBeVisible();

    // Capture invite for member
    await page.goto(`/teams/${teamSlug}`);
    await page.click('text=Invite Members');
    const inviteLink = await page.locator('#invite-link').inputValue();
    await page.locator('dialog[open] button:has-text("Done")').click();

    // Member joins in separate context
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await memberPage.goto('/register');
    await memberPage.fill('#displayName', `Member RBAC ${uid}`);
    await memberPage.fill('#email', `member-rbac-${uid}@example.com`);
    await memberPage.fill('#password', password);
    await memberPage.fill('#confirmPassword', password);
    await memberPage.click('button[type="submit"]');
    await expect(memberPage).toHaveURL('/dashboard');

    await memberPage.click('button:has-text("Join a Team")');
    await memberPage.locator('#teamSlug').fill(inviteLink);
    await memberPage.locator('button[type="submit"]:has-text("Join Team")').click();
    await expect(memberPage).toHaveURL(new RegExp(`/teams/${teamSlug}`), { timeout: 15000 });

    await memberPage.goto(`/teams/${teamSlug}/boards/${boardSlug}`);
    await expect(memberPage.locator('.kanban-board')).toBeVisible({ timeout: 15000 });

    await expect(memberPage.locator('button:has-text("Edit Board")')).toHaveCount(0);
    await expect(memberPage.locator('button:has-text("+ Add Column")')).toHaveCount(0);
    // Members can still add tasks
    await expect(memberPage.locator('.column-footer button').first()).toBeVisible();

    await memberCtx.close();
  });
});

test.describe('Health probes', () => {
  test('GET /health and /ready return ok for operators', async ({ request }) => {
    const health = await request.get('/health');
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toMatchObject({ status: 'ok' });

    const ready = await request.get('/ready');
    expect(ready.ok()).toBeTruthy();
    expect(await ready.json()).toMatchObject({ status: 'ready' });
  });
});
