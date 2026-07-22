import { expect, test } from '@playwright/test';
import { htmxTriggerChange, setupBoard } from './helpers';

test.describe('New feature: toast notifications', () => {
  test('shows a success toast after creating a task (flash-cookie mechanism)', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);

    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', `Toast Task ${uid}`);
    await page.click('button[type="submit"]:has-text("Create Task")');

    // The create navigates (HX-Redirect); the flash cookie fires the toast on load
    await expect(page.locator('.toast').filter({ hasText: 'Task created' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('shows a toast after an inline task edit (HX-Trigger mechanism)', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid, { withTask: true });

    await toDoColumn.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    await expect(modal).toBeVisible();

    const titleInput = modal.locator('#taskTitleInput');
    await titleInput.fill(`Inline Edited ${uid}`);
    await modal.evaluate((el: HTMLElement) => {
      const win = window as Window & { htmx?: { trigger: (e: Element, n: string) => void } };
      win.htmx?.trigger(el.querySelector('#taskTitleInput') as Element, 'change');
    });

    // Inline edits stay on the page, so the HX-Trigger toast shows directly
    await expect(page.locator('.toast').filter({ hasText: 'Title updated' })).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe('New feature: markdown descriptions', () => {
  test('renders a markdown description in the Preview pane', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);

    // Create a task with a markdown description
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', `Md Task ${uid}`);
    await page.fill('#taskDescription', '**bold** and *italic* with `code`');
    await page.click('button[type="submit"]:has-text("Create Task")');

    // Wait for the redirect + HTMX reload to surface the card.
    await expect(page.locator('.task-card').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    // Switch to Preview — markdown should render. Wait for the preview POST
    // (listener registered before the click to avoid a CI race).
    const previewResponse = page.waitForResponse(
      (r) => r.url().includes('/markdown-preview') && r.request().method() === 'POST'
    );
    await modal.locator('button.md-toggle', { hasText: 'Preview' }).click();
    await previewResponse;
    const preview = modal.locator('.markdown-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('strong')).toHaveText('bold');
    await expect(preview.locator('em')).toHaveText('italic');
    await expect(preview.locator('code')).toHaveText('code');
  });

  test('does not render raw HTML in a markdown description (XSS-safe)', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', `XSS Task ${uid}`);
    await page.fill('#taskDescription', '<script>alert(1)</script>');
    await page.click('button[type="submit"]:has-text("Create Task")');

    await expect(page.locator('.task-card').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    const previewResponse = page.waitForResponse(
      (r) => r.url().includes('/markdown-preview') && r.request().method() === 'POST'
    );
    await modal.locator('button.md-toggle', { hasText: 'Preview' }).click();
    await previewResponse;
    const preview = modal.locator('.markdown-preview');
    // The script tag must be escaped (not live), with no executable element
    const html = await preview.innerHTML();
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    // No script element should exist in the preview
    await expect(preview.locator('script')).toHaveCount(0);
  });
});

test.describe('New feature: member management', () => {
  test('owner can change a role and remove a member', async ({ page, browser }) => {
    const uid = Date.now();
    const { teamSlug } = await setupBoard(page, uid);

    // Capture invite link with token while still owner
    await page.goto(`/teams/${teamSlug}`);
    await page.click('text=Invite Members');
    const inviteLink = await page.locator('#invite-link').inputValue();
    await page.locator('dialog[open] button:has-text("Done")').click();

    // A second user joins via a separate browser context (own session)
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await memberPage.goto('/register');
    await memberPage.fill('#displayName', `Member ${uid}`);
    await memberPage.fill('#email', `member-${uid}@example.com`);
    await memberPage.fill('#password', 'Password123!');
    await memberPage.fill('#confirmPassword', 'Password123!');
    await memberPage.click('button[type="submit"]');
    await memberPage.click('button:has-text("Join a Team")');
    await memberPage.locator('#teamSlug').fill(inviteLink);
    await memberPage.locator('button[type="submit"]:has-text("Join Team")').click();
    await memberPage.waitForURL(new RegExp(`/teams/${teamSlug}`));
    await memberCtx.close();

    // Owner (still logged in on the main page) views the team page
    await page.goto(`/teams/${teamSlug}`);
    const memberCard = page.locator('.member-card').filter({ hasText: `Member ${uid}` });
    await expect(memberCard.locator('.role-select')).toBeVisible();

    // Change role to admin -> navigates + reloads with a toast
    await memberCard.locator('.role-select').selectOption('admin');
    await expect(page.locator('.toast').filter({ hasText: 'role updated' })).toBeVisible({
      timeout: 10000,
    });
    const memberCardAfter = page.locator('.member-card').filter({ hasText: `Member ${uid}` });
    await expect(memberCardAfter.locator('.role-select')).toHaveValue('admin');

    // Remove the member -> navigates + reloads
    page.once('dialog', (dialog) => dialog.accept());
    await memberCardAfter.locator('.member-remove').click();
    await expect(page.locator('.toast').filter({ hasText: 'Member removed' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('.member-card').filter({ hasText: `Member ${uid}` })).toHaveCount(0);
  });
});

test.describe('New feature: board task search', () => {
  test('filters task cards by search query', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);

    // Create two tasks with distinct titles
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', `Alpha Bug ${uid}`);
    await page.click('button[type="submit"]:has-text("Create Task")');
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', `Beta Feature ${uid}`);
    await page.click('button[type="submit"]:has-text("Create Task")');

    await expect(page.locator('.task-card', { hasText: `Alpha Bug ${uid}` })).toBeVisible();
    await expect(page.locator('.task-card', { hasText: `Beta Feature ${uid}` })).toBeVisible();

    // Search for a term unique to the Alpha task — only Alpha should remain
    await page.locator('.board-search').fill(`Bug ${uid}`);
    await expect(page.locator('.task-card', { hasText: `Alpha Bug ${uid}` })).toBeVisible();
    await expect(page.locator('.task-card', { hasText: `Beta Feature ${uid}` })).toHaveCount(0);

    // Clear search — both return
    await page.locator('.board-search').fill('');
    await expect(page.locator('.task-card', { hasText: `Beta Feature ${uid}` })).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe('New feature: task checklist', () => {
  test('add, complete, and delete checklist items with a progress bar', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });

    await page.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    // Add two checklist items (wait for each to land)
    await modal.locator('.checklist-add input').fill('First step');
    await modal.locator('.checklist-add button').click();
    await expect(modal.locator('.checklist-item')).toHaveCount(1);
    await modal.locator('.checklist-add input').fill('Second step');
    await modal.locator('.checklist-add button').click();
    await expect(modal.locator('.checklist-item')).toHaveCount(2);
    await expect(modal.locator('.checklist-progress-label')).toContainText('0/2');

    // Complete the first item — progress updates to 1/2 (50%)
    await modal.locator('.checklist-item').first().locator('input[type="checkbox"]').check();
    await expect(modal.locator('.checklist-progress-label')).toContainText('1/2');

    // Delete the second item — only one remains
    page.once('dialog', (dialog) => dialog.accept());
    await modal.locator('.checklist-item').last().locator('.checklist-delete').click();
    await expect(modal.locator('.checklist-item')).toHaveCount(1);
  });
});

test.describe('New feature: keyboard shortcuts', () => {
  test('/ focuses search, n opens add-task, Esc closes modal', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid);

    // "n" opens the add-task modal (first column)
    await page.locator('h1').click(); // settle focus onto the page body
    await page.keyboard.press('n');
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('dialog[open] h3')).toContainText('Add New Task');

    // Esc closes the modal
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // "/" focuses the board search
    await page.locator('h1').click(); // settle focus onto the page body
    await page.keyboard.press('/');
    await expect(page.locator('.board-search')).toBeFocused();
  });
});

test.describe('New feature: duplicate + bulk delete tasks', () => {
  test('duplicates a task from the modal', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid, { withTask: true });
    await expect(toDoColumn.locator('.task-card')).toHaveCount(1);

    await toDoColumn.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    const duplicateResponse = page.waitForResponse(
      (response) => response.url().includes('/duplicate') && response.request().method() === 'POST'
    );
    const duplicateNavigation = page.waitForURL(/\/boards\//);
    await modal.locator('button:has-text("Duplicate")').click();
    await duplicateResponse;
    await duplicateNavigation;
    // Redirect + reload → two cards now (original + copy)
    await expect(toDoColumn.locator('.task-card')).toHaveCount(2, { timeout: 10000 });
    await expect(page.locator('.task-card', { hasText: '(copy)' })).toBeVisible();
  });

  test('bulk-selects and deletes multiple tasks', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);
    // Create three tasks
    for (const t of [`Bulk A ${uid}`, `Bulk B ${uid}`, `Bulk C ${uid}`]) {
      await toDoColumn.locator('footer button').click();
      await page.fill('#taskTitle', t);
      await page.click('button[type="submit"]:has-text("Create Task")');
    }
    await expect(toDoColumn.locator('.task-card')).toHaveCount(3);

    // Enter select mode and check two of them
    await page.locator('#bulk-toggle').click();
    await expect(page.locator('.kanban-board')).toHaveClass(/bulk-mode/);
    const cbs = toDoColumn.locator('.bulk-select-cb');
    await cbs.nth(0).check();
    await cbs.nth(1).check();
    await expect(page.locator('#bulk-count')).toHaveText('2');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#bulk-delete-form button').click();
    // HX-Refresh reloads the board → one task remains
    await expect(toDoColumn.locator('.task-card')).toHaveCount(1, { timeout: 10000 });
  });
});

test.describe('New feature: task archiving', () => {
  test('archive hides a task; show-archived reveals it; unarchive restores', async ({ page }) => {
    const uid = Date.now();
    const { teamSlug, boardSlug, toDoColumn } = await setupBoard(page, uid);
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', `Archive Me ${uid}`);
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(page.locator('.task-card', { hasText: `Archive Me ${uid}` })).toBeVisible({
      timeout: 15000,
    });

    const boardPath = `/teams/${teamSlug}/boards/${boardSlug}`;

    // Open + archive it (server HX-Redirects back to the board)
    await page.locator('.task-card', { hasText: `Archive Me ${uid}` }).click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/archive') && r.request().method() === 'POST'),
      modal.locator('button:has-text("Archive")').click(),
    ]);
    await expect(page.locator('.task-card', { hasText: `Archive Me ${uid}` })).toHaveCount(0, {
      timeout: 15000,
    });

    // Open recycle-bin / archived view via explicit navigation (stable across label changes)
    await page.goto(`${boardPath}?archived=true`);
    await expect(page.locator('.task-card', { hasText: `Archive Me ${uid}` })).toBeVisible({
      timeout: 15000,
    });

    // Unarchive → HX-Redirect returns to the active board without archived=true
    await page.locator('.task-card', { hasText: `Archive Me ${uid}` }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await Promise.all([
      page
        .waitForURL((url) => !url.searchParams.get('archived'), { timeout: 15000 })
        .catch(() => undefined),
      page.waitForResponse(
        (r) => r.url().includes('/unarchive') && r.request().method() === 'POST'
      ),
      page.locator('dialog[open] button:has-text("Unarchive")').click(),
    ]);
    // Ensure we're on the non-archived board view
    if (page.url().includes('archived=true')) {
      await page.goto(boardPath);
    }
    await expect(page.locator('.task-card', { hasText: `Archive Me ${uid}` })).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('New feature: activity log', () => {
  test('records key changes and shows them in the task modal', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', `Activity Task ${uid}`);
    await page.click('button[type="submit"]:has-text("Create Task")');

    // Open the task — wait for card to be visible after redirect + HTMX load.
    await expect(page.locator('.task-card', { hasText: `Activity Task ${uid}` })).toBeVisible({
      timeout: 15000,
    });
    await page.locator('.task-card', { hasText: `Activity Task ${uid}` }).click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.activity-log')).toBeVisible();
    await expect(modal.locator('.activity-log')).toContainText('created');

    // Change the priority → a new activity entry is recorded
    const prioritySelect = modal.locator('#taskPrioritySelect');
    await prioritySelect.evaluate((element) => {
      (element as HTMLSelectElement).value = 'urgent';
    });
    const priorityPatch = page.waitForResponse(
      (r) => r.url().includes('/priority') && r.request().method() === 'PATCH'
    );
    await htmxTriggerChange(prioritySelect);
    await priorityPatch;
    await modal.locator('button:has-text("Close")').click();
    // Wait for modal close + redundant PATCH flushes + column-tasks reloads to settle.
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('.task-card', { hasText: `Activity Task ${uid}` }).first()
    ).toBeVisible({ timeout: 15000 });
    await page
      .locator('.task-card', { hasText: `Activity Task ${uid}` })
      .first()
      .click();
    await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('dialog[open] .activity-log')).toContainText('urgent', {
      timeout: 15000,
    });
  });
});

test('markdown Preview reflects unsaved edits without reopening the task', async ({ page }) => {
  const uid = Date.now();
  await setupBoard(page, uid, { withTask: true });

  await page.locator('.task-card').first().click();
  const modal = page.locator('dialog[open]');
  await expect(modal).toBeVisible();

  // Type NEW markdown into the description (do NOT save/reopen)
  await modal.locator('#taskDescriptionInput').fill('**fresh edit** and *italic*');
  await modal.locator('button.md-toggle', { hasText: 'Preview' }).click();

  // The preview must show the just-typed (unsaved) content
  const preview = modal.locator('.markdown-preview');
  await expect(preview.locator('strong')).toHaveText('fresh edit');
  await expect(preview.locator('em')).toHaveText('italic');
});

test('clicking an "Assigned To You" item opens the task on its board', async ({ page }) => {
  const uid = Date.now();
  const { toDoColumn } = await setupBoard(page, uid);

  // Create a task and assign it to ourselves so it appears in "Assigned To You"
  await toDoColumn.locator('footer button').click();
  await page.fill('#taskTitle', `Dash Task ${uid}`);
  await page.selectOption('#taskAssignee', { label: `User ${uid}` });
  await page.click('button[type="submit"]:has-text("Create Task")');

  // On the dashboard, the task appears in "Assigned To You"
  await page.goto('/dashboard');
  const item = page.locator('.dashboard-task-item', { hasText: `Dash Task ${uid}` });
  await expect(item).toBeVisible();

  // Clicking it opens the task on its board (deep-link)
  await item.click();
  await expect(page.locator('.board-header')).toBeVisible();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await expect(page.locator('dialog[open] #taskTitleInput')).toHaveValue(`Dash Task ${uid}`);
});

test.describe('Autosave on close', () => {
  test('editing the description then clicking Close still saves', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });
    await page.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    // Type and close IMMEDIATELY — don't blur, don't wait for a debounce
    const descPatch = page.waitForResponse(
      (r) => r.url().includes('/description') && r.request().method() === 'PATCH'
    );
    await modal.locator('#taskDescriptionInput').fill('Saved on close');
    await modal.locator('button:has-text("Close")').click();
    await descPatch; // the close must have flushed the save
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });

    // Wait for column-tasks reload (triggered by task-updated event) to settle.
    await expect(page.locator('.task-card').first()).toBeVisible({ timeout: 10000 });
    // Reopen — the edit must have persisted
    await page.locator('.task-card').first().click();
    await expect(page.locator('dialog[open] #taskDescriptionInput')).toHaveValue('Saved on close');
  });

  test('editing the title then pressing Esc still saves (Esc does not blur)', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid, { withTask: true });
    await page.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    const titlePatch = page.waitForResponse(
      (r) => r.url().includes('/title') && r.request().method() === 'PATCH'
    );
    await modal.locator('#taskTitleInput').fill(`Escaped Title ${uid}`);
    await page.keyboard.press('Escape'); // Esc closes without blurring
    await titlePatch;
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });

    await expect(page.locator('.task-card').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.task-card').first().click();
    await expect(page.locator('dialog[open] #taskTitleInput')).toHaveValue(`Escaped Title ${uid}`);
  });
});
