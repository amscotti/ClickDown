import { expect, test } from '@playwright/test';

test.describe('ClickDown E2E Task Deep-Linking (Shareable URLs)', () => {
  const testPassword = 'Password123!';

  test('a shared /tasks/:id link opens the board with that task modal open', async ({ page }) => {
    const uniqueId = Date.now();

    // --- Set up: register, create team/board/task ---
    await page.goto('/register');
    await page.fill('#displayName', 'Link Sharer');
    await page.fill('#email', `share-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', `Share Team ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Team")');

    await page.click('text=Create Board');
    await page.fill('#boardName', `Share Board ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Board")');

    const toDoCol = page.locator('.kanban-column').nth(1);
    await toDoCol.locator('footer button').click();
    const taskTitle = `Shareable Task ${uniqueId}`;
    await page.fill('#taskTitle', taskTitle);
    await page.selectOption('#taskPriority', 'high');
    await page.click('button[type="submit"]:has-text("Create Task")');

    // Capture the task id from its card
    const taskCard = toDoCol.locator('.task-card', { hasText: taskTitle });
    await expect(taskCard).toBeVisible();
    const taskId = (await taskCard.getAttribute('data-task-id')) ?? '';
    expect(taskId).toBeTruthy();

    // --- Act: open the shareable /tasks/:id link directly ---
    await page.goto(`/tasks/${taskId}`);

    // The server redirects to the board…
    await expect(page).toHaveURL(new RegExp(`/boards/share-board-${uniqueId}`));
    // The board renders...
    await expect(page.locator('.board-header')).toBeVisible();
    // ...and the deep-linked task's modal auto-opens
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Task Details');
    await expect(modal.locator('#taskTitleInput')).toHaveValue(taskTitle);

    // The ?task= param is stripped from the URL after auto-open so reloads
    // (e.g. from dragging a task) don't re-trigger the modal.
    await expect(page).not.toHaveURL(/task=/);

    // The modal exposes the unique task id and a copy-link control
    await expect(modal.locator('.task-id-ref')).toContainText(taskId);
    await expect(modal.locator('button:has-text("Copy Link")')).toBeVisible();
  });

  test('a deep-linked task does not re-open after closing and reloading the board', async ({
    page,
  }) => {
    const uniqueId = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', 'No Reopen');
    await page.fill('#email', `noreopen-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', `No Reopen Team ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await page.click('text=Create Board');
    await page.fill('#boardName', `No Reopen Board ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Board")');

    const toDoCol = page.locator('.kanban-column').nth(1);
    await toDoCol.locator('footer button').click();
    await page.fill('#taskTitle', `No Reopen Task ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Task")');
    const taskId = (await toDoCol.locator('.task-card').first().getAttribute('data-task-id')) ?? '';

    // Open via the deep link → modal auto-opens
    await page.goto(`/tasks/${taskId}`);
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    // Close it, then reload (a drag triggers exactly this kind of reload)
    await modal.locator('button:has-text("Close")').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.reload();

    // The modal must NOT re-open after reload
    await expect(page.locator('.board-header')).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('the Copy Link button copies the shareable task URL to the clipboard', async ({
    page,
    context,
    browserName,
  }) => {
    // clipboard-read permission is only grantable on Chromium in Playwright.
    if (browserName !== 'chromium') test.skip();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const uniqueId = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', 'Clip User');
    await page.fill('#email', `clip-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', `Clip Team ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await page.click('text=Create Board');
    await page.fill('#boardName', `Clip Board ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Board")');

    const toDoCol = page.locator('.kanban-column').nth(1);
    await toDoCol.locator('footer button').click();
    await page.fill('#taskTitle', `Clip Task ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Task")');

    // Open the task modal
    await page.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    const taskId = await modal.locator('[data-task-id]').getAttribute('data-task-id');

    // Click "Copy Link" and verify the clipboard contains the shareable URL
    await modal.locator('button:has-text("Copy Link")').click();
    await expect(modal.locator('button:has-text("Copied!")')).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(`/tasks/${taskId}`);
  });

  test('an unauthenticated visitor of a task link is sent to login and back', async ({ page }) => {
    const uniqueId = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', 'Owner DL');
    await page.fill('#email', `dl-owner-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', `DL Team ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Team")');
    await page.click('text=Create Board');
    await page.fill('#boardName', `DL Board ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Board")');

    const toDoCol = page.locator('.kanban-column').nth(1);
    await toDoCol.locator('footer button').click();
    await page.fill('#taskTitle', `DL Task ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Task")');
    const taskId = await toDoCol.locator('.task-card').first().getAttribute('data-task-id');

    // Logout
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');

    // Visit the shared task link while logged out -> login with return path
    await page.goto(`/tasks/${taskId}`);
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).toContain(`redirect=${encodeURIComponent(`/tasks/${taskId}`)}`);
  });
});
