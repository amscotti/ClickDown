import { expect, type Page, test } from '@playwright/test';

// Helper to simulate HTML5 Drag and Drop events in Playwright
async function dragAndDropTask(page: Page, taskId: string, targetColumnId: string) {
  await page.evaluate(
    ({ taskId, columnId }: { taskId: string; columnId: string }) => {
      const srcEl = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
      const dstEl = document.querySelector(`.column-tasks[data-column-id="${columnId}"]`);
      if (!srcEl || !dstEl) {
        throw new Error(
          `Drag source (.task-card[data-task-id="${taskId}"]) or drop target (.column-tasks[data-column-id="${columnId}"]) not found.`
        );
      }

      const dataTransfer = new DataTransfer();

      // 1. Dispatch dragstart on source task-card
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      srcEl.dispatchEvent(dragStartEvent);

      // Set DataTransfer data exactly as handleDragStart in board.eta does
      dataTransfer.setData('text/plain', taskId);
      dataTransfer.setData('drag-type', 'task');

      // 2. Dispatch dragover on target column-tasks container
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      dstEl.dispatchEvent(dragOverEvent);

      // 3. Dispatch drop on target column-tasks container
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      dstEl.dispatchEvent(dropEvent);

      // 4. Dispatch dragend on source task-card
      const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      srcEl.dispatchEvent(dragEndEvent);
    },
    { taskId, columnId: targetColumnId }
  );
}

test.describe('ClickDown E2E Kanban Interactions', () => {
  const testEmail = `interactions-user-${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const teamName = `Interactions Team ${Date.now()}`;
  const boardName = `Interactions Sprint Board ${Date.now()}`;
  const task1Title = `Task 1 ${Date.now()}`;
  const task2Title = `Task 2 ${Date.now()}`;

  test('should support column customization, WIP limit warnings, and drag-and-drop', async ({
    page,
  }) => {
    // Enable browser log mirroring
    page.on('pageerror', (err) => {
      console.error('BROWSER ERROR:', err);
    });
    page.on('console', (msg) => {
      console.log('BROWSER LOG:', msg.text());
    });

    // 1. Register a new user
    await page.goto('/register');
    await page.fill('#displayName', 'Alex Interactions');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');

    // 2. Create a Team
    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.fill('#teamDescription', 'Team for E2E interaction testing');
    await page.click('button[type="submit"]:has-text("Create Team")');

    // Should redirect to Team Page
    await expect(page).toHaveURL(/\/teams\/interactions-team-/);

    // 3. Create a Board
    await page.click('text=Create Board');
    await page.fill('#boardName', boardName);
    await page.fill('#boardDescription', 'Board for E2E interaction testing');
    await page.click('button[type="submit"]:has-text("Create Board")');

    // Should redirect to Board Page
    await expect(page).toHaveURL(/\/boards\/interactions-sprint-board-/);

    // Verify 4 columns exist (Backlog, To Do, In Progress, Done)
    const columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(4);

    // 4. Edit To Do column (index 1) to set a WIP limit of 1 and change name
    // Click the triple-dot options button on To Do column
    const toDoColumn = columns.nth(1);
    await toDoColumn.locator('.column-menu-btn').click();

    // Verify column edit modal is open
    const editModal = page.locator('dialog[open]');
    await expect(editModal).toBeVisible();
    await expect(editModal.locator('h3')).toContainText('Edit Column');

    // Update column details
    await editModal.locator('#columnName').fill('Ready Dev');
    await editModal.locator('#columnWipLimit').fill('1');
    await editModal.locator('button[type="submit"]:has-text("Save Changes")').click();

    // Verify changes are visible on column
    await expect(editModal).not.toBeVisible();
    await expect(toDoColumn.locator('h3')).toContainText('Ready Dev');
    await expect(toDoColumn.locator('.wip-limit')).toContainText('1');

    // 5. Add Task 1 (should NOT exceed WIP limit since WIP limit is 1 and task count is 1)
    await toDoColumn.locator('footer button').click();
    const addTaskModal = page.locator('dialog[open]');
    await expect(addTaskModal).toBeVisible();
    await page.fill('#taskTitle', task1Title);
    await page.fill('#taskDescription', 'First task for WIP and drag-and-drop');
    await page.click('button[type="submit"]:has-text("Create Task")');

    await expect(addTaskModal).not.toBeVisible();

    // Verify Task 1 is visible, task count is 1, and column is NOT in warning state
    const taskCard1 = toDoColumn.locator('.task-card', { hasText: task1Title });
    await expect(taskCard1).toBeVisible();
    await expect(toDoColumn.locator('.task-count')).toContainText('1');
    await expect(toDoColumn).not.toHaveClass(/wip-exceeded/);

    // 6. Add Task 2 (should now EXCEED WIP limit, setting wip-exceeded class!)
    await toDoColumn.locator('footer button').click();
    await expect(addTaskModal).toBeVisible();
    await page.fill('#taskTitle', task2Title);
    await page.fill('#taskDescription', 'Second task to trigger WIP exceeded');
    await page.click('button[type="submit"]:has-text("Create Task")');

    await expect(addTaskModal).not.toBeVisible();

    // Verify both tasks are in the column, task count is 2, and wip-exceeded class is present!
    const taskCard2 = toDoColumn.locator('.task-card', { hasText: task2Title });
    await expect(taskCard2).toBeVisible();
    await expect(toDoColumn.locator('.task-count')).toContainText('2');
    await expect(toDoColumn).toHaveClass(/wip-exceeded/);

    // 7. Drag Task 1 from Ready Dev column (index 1) to In Progress column (index 2)
    const inProgressColumn = columns.nth(2);

    // Retrieve custom DOM IDs for task and target column
    const taskId1 = (await taskCard1.getAttribute('data-task-id')) || '';
    const inProgressColId = (await inProgressColumn.getAttribute('data-column-id')) || '';

    expect(taskId1).not.toBe('');
    expect(inProgressColId).not.toBe('');

    // Trigger E2E HTML5 drag-and-drop operation
    await dragAndDropTask(page, taskId1, inProgressColId);

    // Wait for task count updates
    // Ready Dev should drop back to 1 task, removing the wip-exceeded class!
    await expect(toDoColumn.locator('.task-count')).toContainText('1');
    await expect(toDoColumn).not.toHaveClass(/wip-exceeded/);

    // In Progress should now have 1 task!
    await expect(inProgressColumn.locator('.task-count')).toContainText('1');
    const draggedTask = inProgressColumn.locator('.task-card', { hasText: task1Title });
    await expect(draggedTask).toBeVisible();

    // Cleanup: Delete board and team
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

    await expect(boardEditDialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/teams\/interactions-team-/);

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

    await expect(teamEditDialog).not.toBeVisible();
    await expect(page).toHaveURL('/dashboard');
  });
});
