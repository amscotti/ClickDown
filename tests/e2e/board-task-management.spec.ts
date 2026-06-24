import { expect, type Page, test } from '@playwright/test';
import { htmxTriggerChange } from './helpers';

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

// Helper to simulate HTML5 Drag and Drop task moving to an empty column
async function dragAndDropTaskToColumn(page: Page, taskId: string, targetColumnId: string) {
  await page.evaluate(
    ({ taskId, columnId }: { taskId: string; columnId: string }) => {
      const srcEl = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
      const dstEl = document.querySelector(`.column-tasks[data-column-id="${columnId}"]`);
      if (!srcEl || !dstEl) {
        throw new Error('Source card or target column tasks container not found.');
      }

      const dataTransfer = new DataTransfer();

      // Dispatch dragstart
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      srcEl.dispatchEvent(dragStartEvent);

      dataTransfer.setData('text/plain', taskId);
      dataTransfer.setData('drag-type', 'task');

      // Dispatch dragover
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      dstEl.dispatchEvent(dragOverEvent);

      // Dispatch drop
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      dstEl.dispatchEvent(dropEvent);

      // Dispatch dragend
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

test.describe('ClickDown Comprehensive E2E Board and Task Management Lifecycle', () => {
  const uniqueId = Date.now();
  const testEmail = `lifecycle-user-${uniqueId}@example.com`;
  const testPassword = 'Password123!';
  const teamName = `Operations Team ${uniqueId}`;
  const boardName = `Sprint Plan Board ${uniqueId}`;

  const taskATitle = `Task Alpha ${uniqueId}`;
  const taskBTitle = `Task Beta ${uniqueId}`;
  const taskCTitle = `Task Gamma ${uniqueId}`;

  test('should go through user registration, team/board management, column customization, task creation, same-column reordering, cross-column moving, detailed inline modal editing, and full cleanup', async ({
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
    await page.fill('#displayName', 'Alex Lifecycle');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Verify root page redirects an authenticated user back to /dashboard
    await page.goto('/');
    await expect(page).toHaveURL('/dashboard');

    // 2. Create Team
    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.fill('#teamDescription', 'E2E automated operations workspace');
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(/\/teams\//);

    const teamPageUrl = page.url();

    // 3. Create Board
    await page.click('text=Create Board');
    await page.fill('#boardName', boardName);
    await page.fill('#boardDescription', 'Central operations dashboard');
    await page.click('button[type="submit"]:has-text("Create Board")');
    await expect(page).toHaveURL(/\/boards\//);

    // Verify 4 default columns
    let columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(4);

    // 4. Create and Edit Custom Column
    await page.click('text=Add Column');
    const newColModal = page.locator('dialog[open]');
    await expect(newColModal).toBeVisible();
    await page.fill('#columnName', 'QA backlog');
    await page.fill('#columnWipLimit', '2');
    await page.click('button[type="submit"]:has-text("Add Column")');
    await expect(newColModal).not.toBeVisible();

    // Re-query columns
    columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(5);
    const customCol = columns.nth(4);
    await expect(customCol.locator('h3')).toContainText('QA backlog');
    await expect(customCol.locator('.wip-limit')).toContainText('2');

    // Edit Custom Column
    await customCol.locator('.column-menu-btn').click();
    const editColModal = page.locator('dialog[open]');
    await expect(editColModal).toBeVisible();
    await page.fill('#columnName', 'Ready for QA');
    await page.fill('#columnWipLimit', '3');
    await page.click('button[type="submit"]:has-text("Save Changes")');
    await expect(editColModal).not.toBeVisible();
    await expect(customCol.locator('h3')).toContainText('Ready for QA');
    await expect(customCol.locator('.wip-limit')).toContainText('3');

    // 5. Create Three Tasks in "To Do" column (index 1)
    const toDoColumn = columns.nth(1);

    // Create Task A
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', taskATitle);
    await page.fill('#taskDescription', 'Task A detailed specifications');
    await page.selectOption('#taskPriority', 'high');
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: taskATitle })).toBeVisible();

    // Create Task B
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', taskBTitle);
    await page.fill('#taskDescription', 'Task B detailed specifications');
    await page.selectOption('#taskPriority', 'medium');
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: taskBTitle })).toBeVisible();

    // Create Task C
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', taskCTitle);
    await page.fill('#taskDescription', 'Task C detailed specifications');
    await page.selectOption('#taskPriority', 'low');
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoColumn.locator('.task-card', { hasText: taskCTitle })).toBeVisible();

    // Verify task count is 3
    await expect(toDoColumn.locator('.task-count')).toContainText('3');

    // Extract Task IDs from DOM
    const cardA = toDoColumn.locator('.task-card', { hasText: taskATitle });
    const cardB = toDoColumn.locator('.task-card', { hasText: taskBTitle });
    const cardC = toDoColumn.locator('.task-card', { hasText: taskCTitle });

    const idA = (await cardA.getAttribute('data-task-id')) || '';
    const idB = (await cardB.getAttribute('data-task-id')) || '';
    const idC = (await cardC.getAttribute('data-task-id')) || '';

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idC).toBeTruthy();

    // 6. SAME COLUMN TASK REORDERING INTERACTION
    // Drag Task C and drop it on the top half of Task A -> Places Task C at the top
    const reorderPromise1 = page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/reorder') && response.request().method() === 'POST'
    );
    await dragAndDropTaskOnCard(page, idC, idA, true);
    await reorderPromise1;

    // Verify Order is C -> A -> B
    const reorderedCards1 = toDoColumn.locator('.task-card');
    await expect(reorderedCards1.nth(0).locator('h4')).toContainText(taskCTitle);
    await expect(reorderedCards1.nth(1).locator('h4')).toContainText(taskATitle);
    await expect(reorderedCards1.nth(2).locator('h4')).toContainText(taskBTitle);

    // Drag Task B and drop it on the top half of Task A -> Places Task B before Task A, after Task C
    const reorderPromise2 = page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/reorder') && response.request().method() === 'POST'
    );
    await dragAndDropTaskOnCard(page, idB, idA, true);
    await reorderPromise2;

    // Verify Order is C -> B -> A
    const reorderedCards2 = toDoColumn.locator('.task-card');
    await expect(reorderedCards2.nth(0).locator('h4')).toContainText(taskCTitle);
    await expect(reorderedCards2.nth(1).locator('h4')).toContainText(taskBTitle);
    await expect(reorderedCards2.nth(2).locator('h4')).toContainText(taskATitle);

    // 7. CROSS COLUMN TASK MOVING INTERACTION
    // Move Task B (the middle task) to our custom column "Ready for QA"
    const targetColId = (await customCol.getAttribute('data-column-id')) || '';
    expect(targetColId).toBeTruthy();

    const movePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/reorder') && response.request().method() === 'POST'
    );
    await dragAndDropTaskToColumn(page, idB, targetColId);
    await movePromise;

    // Verify Task Counts
    await expect(toDoColumn.locator('.task-count')).toContainText('2');
    await expect(customCol.locator('.task-count')).toContainText('1');

    // Verify task card details are present in the target column
    const movedCard = customCol.locator('.task-card', { hasText: taskBTitle });
    await expect(movedCard).toBeVisible();

    // 8. DETAILED TASK MODAL INLINE UPDATES
    // Click Task Alpha (idA) to open the modal
    const targetCardA = toDoColumn.locator('.task-card', { hasText: taskATitle });
    await targetCardA.click();

    const detailModal = page.locator('dialog[open]');
    await expect(detailModal).toBeVisible();

    // Edit Title
    const titleInput = detailModal.locator('#taskTitleInput');
    const updateTitlePromise = page.waitForResponse(
      (response) => response.url().includes('/title') && response.request().method() === 'PATCH'
    );
    const updatedTitleText = `Updated Task Alpha ${uniqueId}`;
    await titleInput.fill(updatedTitleText);
    await htmxTriggerChange(titleInput);
    await updateTitlePromise;

    // Edit Description
    const descInput = detailModal.locator('#taskDescriptionInput');
    const updateDescPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/description') && response.request().method() === 'PATCH'
    );
    await descInput.fill('Task Alpha updated description through E2E tests');
    await htmxTriggerChange(descInput);
    await updateDescPromise;

    // Change Priority
    const prioritySelect = detailModal.locator('#taskPrioritySelect');
    const updatePriorityPromise = page.waitForResponse(
      (response) => response.url().includes('/priority') && response.request().method() === 'PATCH'
    );
    await prioritySelect.selectOption('urgent');
    await updatePriorityPromise;

    // Change Assignee
    const assigneeSelect = detailModal.locator('#taskAssigneeSelect');
    const updateAssigneePromise = page.waitForResponse(
      (response) => response.url().includes('/assignee') && response.request().method() === 'PATCH'
    );
    await assigneeSelect.selectOption({ label: 'Alex Lifecycle' });
    await updateAssigneePromise;

    // Change Due Date
    const dueDateInput = detailModal.locator('#taskDueDateInput');
    const updateDueDatePromise = page.waitForResponse(
      (response) => response.url().includes('/dueDate') && response.request().method() === 'PATCH'
    );

    // Set due date to tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().split('T')[0] ?? '';
    await dueDateInput.fill(dateString);
    await htmxTriggerChange(dueDateInput);
    await updateDueDatePromise;

    // Close the Modal
    await detailModal.locator('button:has-text("Close")').click();
    await expect(detailModal).not.toBeVisible();

    // Verify details rendered on Board Card
    await expect(targetCardA.locator('h4')).toContainText(updatedTitleText);
    await expect(targetCardA.locator('.priority-badge')).toContainText('urgent');
    await expect(targetCardA.locator('.task-assignee')).toBeVisible();
    await expect(targetCardA.locator('.task-due-date')).toBeVisible();

    // 9. CLEANUPS: Delete Task
    await targetCardA.click();
    await expect(detailModal).toBeVisible();

    const taskDeleteNav = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept()); // Accept confirm alert dialog
    await detailModal.locator('button:has-text("Delete Task")').click();
    await taskDeleteNav;
    await expect(detailModal).not.toBeVisible();

    // Verify task is deleted from "To Do"
    await expect(toDoColumn.locator('.task-card', { hasText: updatedTitleText })).not.toBeVisible();
    await expect(toDoColumn.locator('.task-count')).toContainText('1');

    // Delete Custom Column
    await customCol.locator('.column-menu-btn').click();
    const editColModalAfter = page.locator('dialog[open]');
    await expect(editColModalAfter).toBeVisible();

    const colDeletePromise = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await editColModalAfter.locator('button:has-text("Delete Column")').click();
    await colDeletePromise;
    await expect(editColModalAfter).not.toBeVisible();

    // Verify column count is back to 4
    await expect(page.locator('.kanban-column')).toHaveCount(4);

    // Delete Board
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

    // Direct back to Team page
    await expect(page).toHaveURL(new RegExp(teamPageUrl));

    // Delete Team
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

    // Direct back to Dashboard
    await expect(page).toHaveURL('/dashboard');
  });
});
