import { expect, type Page, test } from '@playwright/test';

// Helper to simulate HTML5 Drag and Drop task reordering
async function dragAndDropTaskOnCard(
  page: Page,
  sourceTaskId: string,
  targetTaskId: string,
  dropOnTopHalf: boolean
) {
  await page.evaluate(
    ({ sourceId, targetId, topHalf }: { sourceId: string; targetId: string; topHalf: boolean }) => {
      const srcEl = document.querySelector(`.task-card[data-task-id="${sourceId}"]`);
      const dstEl = document.querySelector(`.task-card[data-task-id="${targetId}"]`);
      const container = dstEl?.closest('.column-tasks');
      if (!srcEl || !dstEl || !container) {
        throw new Error('Source card, target card, or column container not found.');
      }

      const dataTransfer = new DataTransfer();

      // Dispatch dragstart on source
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      srcEl.dispatchEvent(dragStartEvent);

      dataTransfer.setData('text/plain', sourceId);
      dataTransfer.setData('drag-type', 'task');

      // Calculate coordinates to drop on upper or lower half of target card
      const rect = dstEl.getBoundingClientRect();
      const clientY = topHalf ? rect.top + rect.height / 4 : rect.top + (3 * rect.height) / 4;

      // Dispatch dragover on target container
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientY,
      });
      container.dispatchEvent(dragOverEvent);

      // Dispatch drop on target card
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientY,
      });
      dstEl.dispatchEvent(dropEvent);

      // Dispatch dragend on source
      const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      srcEl.dispatchEvent(dragEndEvent);
    },
    { sourceId: sourceTaskId, targetId: targetTaskId, topHalf: dropOnTopHalf }
  );
}

test.describe('ClickDown E2E Kanban Task Reordering & Management Lifecycle', () => {
  const uniqueId = Date.now();
  const testEmail = `reorder-user-${uniqueId}@example.com`;
  const testPassword = 'Password123!';
  const teamName = `Reorder Team ${uniqueId}`;
  const boardName = `Reorder Board ${uniqueId}`;

  const taskATitle = `Task A ${uniqueId}`;
  const taskBTitle = `Task B ${uniqueId}`;
  const taskCTitle = `Task C ${uniqueId}`;

  test('should support creating multiple tasks, reordering them within the same column, dragging across columns, and managing boards', async ({
    page,
  }) => {
    // Enable browser log mirroring
    page.on('pageerror', (err) => {
      console.error('BROWSER ERROR:', err);
    });
    page.on('console', (msg) => {
      console.log('BROWSER LOG:', msg.text());
    });

    // 1. Onboarding
    await page.goto('/register');
    await page.fill('#displayName', 'Alex Reorder');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // 2. Create Team
    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.fill('#teamDescription', 'High-concurrency task reordering workspace');
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(/\/teams\//);

    const teamPageUrl = page.url();

    // 3. Create Board
    await page.click('text=Create Board');
    await page.fill('#boardName', boardName);
    await page.fill('#boardDescription', 'Sprint planning and task sorting');
    await page.click('button[type="submit"]:has-text("Create Board")');
    await expect(page).toHaveURL(/\/boards\//);

    const columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(4);

    // 4. Create Task A inside To Do column (index 1)
    const toDoColumn = columns.nth(1);
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', taskATitle);
    await page.fill('#taskDescription', 'First task description');
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: taskATitle })).toBeVisible();

    // Create Task B inside To Do column
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', taskBTitle);
    await page.fill('#taskDescription', 'Second task description');
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: taskBTitle })).toBeVisible();

    // Create Task C inside To Do column
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', taskCTitle);
    await page.fill('#taskDescription', 'Third task description');
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: taskCTitle })).toBeVisible();

    // Verify task count is 3
    await expect(toDoColumn.locator('.task-count')).toContainText('3');

    // Extract task IDs from cards in To Do column
    const cardA = toDoColumn.locator('.task-card', { hasText: taskATitle });
    const cardB = toDoColumn.locator('.task-card', { hasText: taskBTitle });
    const cardC = toDoColumn.locator('.task-card', { hasText: taskCTitle });

    const idA = (await cardA.getAttribute('data-task-id')) || '';
    const idB = (await cardB.getAttribute('data-task-id')) || '';
    const idC = (await cardC.getAttribute('data-task-id')) || '';

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idC).toBeTruthy();

    // 5. REORDER INTERACTION: Drag Task C and drop it on the top half of Task A
    // This should place Task C at the very beginning (index 0) of the column!
    const reorderPromise1 = page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/reorder') && response.request().method() === 'POST'
    );
    await dragAndDropTaskOnCard(page, idC, idA, true);
    await reorderPromise1;

    // Verify DOM order: Task C is now index 0, followed by Task A, then Task B
    const cardsAfterReorder1 = toDoColumn.locator('.task-card');
    await expect(cardsAfterReorder1.nth(0).locator('h4')).toContainText(taskCTitle);
    await expect(cardsAfterReorder1.nth(1).locator('h4')).toContainText(taskATitle);
    await expect(cardsAfterReorder1.nth(2).locator('h4')).toContainText(taskBTitle);

    // 6. REORDER INTERACTION: Drag Task B and drop it on the top half of Task A
    // This should place Task B before Task A but after Task C (Task C -> Task B -> Task A)
    const reorderPromise2 = page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/reorder') && response.request().method() === 'POST'
    );
    await dragAndDropTaskOnCard(page, idB, idA, true);
    await reorderPromise2;

    // Verify DOM order: Task C -> Task B -> Task A
    const cardsAfterReorder2 = toDoColumn.locator('.task-card');
    await expect(cardsAfterReorder2.nth(0).locator('h4')).toContainText(taskCTitle);
    await expect(cardsAfterReorder2.nth(1).locator('h4')).toContainText(taskBTitle);
    await expect(cardsAfterReorder2.nth(2).locator('h4')).toContainText(taskATitle);

    // 7. CLEANUP: Delete board and team
    await page.click('text=Edit Board');
    const boardEditDialog = page.locator('dialog[open]');
    await expect(boardEditDialog).toBeVisible();

    const boardDeleteResponse = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await boardEditDialog.locator('button:has-text("Delete Board")').click();
    await boardDeleteResponse;
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
