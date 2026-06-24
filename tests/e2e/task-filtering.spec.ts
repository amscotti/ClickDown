import { expect, test } from '@playwright/test';

test.describe('ClickDown E2E Kanban Task Filtering', () => {
  const uniqueId = Date.now();
  const testEmail = `filter-user-${uniqueId}@example.com`;
  const testPassword = 'Password123!';
  const teamName = `Filter Team ${uniqueId}`;
  const boardName = `Filter Board ${uniqueId}`;

  const myTaskTitle = `My Task ${uniqueId}`;
  const otherTaskTitle = `Other Task ${uniqueId}`;

  test('should support toggling the "My tasks only" filter to dynamically show/hide unassigned or other user tasks', async ({
    page,
  }) => {
    // Enable browser log mirroring
    page.on('pageerror', (err) => {
      console.error('BROWSER ERROR:', err);
    });
    page.on('console', (msg) => {
      console.log('BROWSER LOG:', msg.text());
    });

    // 1. User Registration
    await page.goto('/register');
    await page.fill('#displayName', 'Alex Filter');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // 2. Create Team
    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.fill('#teamDescription', 'E2E task filtering evaluation team');
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(/\/teams\//);

    const teamPageUrl = page.url();

    // 3. Create Board
    await page.click('text=Create Board');
    await page.fill('#boardName', boardName);
    await page.fill('#boardDescription', 'Audit board with task filtering');
    await page.click('button[type="submit"]:has-text("Create Board")');
    await expect(page).toHaveURL(/\/boards\//);

    // 4. Verify Columns and Filter Toggle
    const columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(4);

    const filterToggle = page.locator('.filter-toggle input[type="checkbox"]');
    await expect(filterToggle).toBeVisible();
    await expect(filterToggle).not.toBeChecked();

    // 5. Create Task 1: "My Task" and assign it to ourselves
    const toDoColumn = columns.nth(1);
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', myTaskTitle);
    await page.fill('#taskDescription', 'Task assigned to myself');
    await page.selectOption('#taskPriority', 'medium');

    // Choose "Alex Filter" from Assignee dropdown
    await page.selectOption('#taskAssignee', { label: 'Alex Filter' });
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: myTaskTitle })).toBeVisible();

    // Create Task 2: "Other Task" and leave it Unassigned
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', otherTaskTitle);
    await page.fill('#taskDescription', 'Task left unassigned');
    await page.selectOption('#taskPriority', 'low');

    // Leave Assignee as "Unassigned" (default)
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: otherTaskTitle })).toBeVisible();

    // Verify task count is 2 and both are rendered
    await expect(toDoColumn.locator('.task-count')).toContainText('2');
    const myCard = toDoColumn.locator('.task-card', { hasText: myTaskTitle });
    const otherCard = toDoColumn.locator('.task-card', { hasText: otherTaskTitle });
    await expect(myCard).toBeVisible();
    await expect(otherCard).toBeVisible();

    // 6. TOGGLE FILTER ON: Check "My tasks only"
    await filterToggle.click();

    // Wait for the board GET (not the column-tasks GETs that follow).
    // The board page GET URL ends with the board slug, not /tasks.
    await page.waitForResponse(
      (response) =>
        response.url().includes(`/boards/`) &&
        !response.url().includes('/tasks') &&
        !response.url().includes('/columns') &&
        response.request().method() === 'GET'
    );

    // Re-locate elements after swap
    const activeFilterToggle = page.locator('.filter-toggle input[type="checkbox"]');
    await expect(activeFilterToggle).toBeChecked();

    const activeToDoColumn = page.locator('.kanban-column').nth(1);

    // ONLY My Task should be visible! Other Task should be hidden!
    // Use auto-retrying assertions instead of hardcoded timeouts.
    await expect(activeToDoColumn.locator('.task-card', { hasText: myTaskTitle })).toBeVisible({
      timeout: 10000,
    });
    await expect(activeToDoColumn.locator('.task-card', { hasText: otherTaskTitle })).toHaveCount(
      0,
      { timeout: 10000 }
    );
    await expect(activeToDoColumn.locator('.task-count')).toContainText('1');

    // 7. TOGGLE FILTER OFF: Uncheck "My tasks only"
    await activeFilterToggle.click();
    await page.waitForResponse(
      (response) =>
        response.url().includes(`/boards/`) &&
        !response.url().includes('/tasks') &&
        !response.url().includes('/columns') &&
        response.request().method() === 'GET'
    );

    // Re-locate
    const inactiveFilterToggle = page.locator('.filter-toggle input[type="checkbox"]');
    await expect(inactiveFilterToggle).not.toBeChecked();

    const inactiveToDoColumn = page.locator('.kanban-column').nth(1);

    // BOTH cards should be visible again!
    await expect(inactiveToDoColumn.locator('.task-card', { hasText: myTaskTitle })).toBeVisible({
      timeout: 10000,
    });
    await expect(inactiveToDoColumn.locator('.task-card', { hasText: otherTaskTitle })).toBeVisible(
      { timeout: 10000 }
    );
    await expect(inactiveToDoColumn.locator('.task-count')).toContainText('2');

    // 8. TEARDOWN: Delete Board
    await page.click('text=Edit Board');
    const boardEditDialog = page.locator('dialog[open]');
    await expect(boardEditDialog).toBeVisible();

    const boardDeleteResponse = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await boardEditDialog.locator('button:has-text("Delete Board")').click();
    await boardDeleteResponse;
    await page.waitForLoadState('networkidle');

    // Delete Team
    await expect(page).toHaveURL(new RegExp(teamPageUrl));
    await page.click('text=Edit Team');
    const teamEditDialog = page.locator('dialog[open]');
    await expect(teamEditDialog).toBeVisible();

    const teamDeleteResponse = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await teamEditDialog.locator('button:has-text("Delete Team")').click();
    await teamDeleteResponse;
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL('/dashboard');
  });
});
