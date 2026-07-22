import { expect, type Page, test } from '@playwright/test';
import { htmxTriggerChange } from './helpers';

// Helper to simulate HTML5 Drag and Drop task events
async function dragAndDropTask(page: Page, taskId: string, targetColumnId: string) {
  await page.evaluate(
    ({ taskId, columnId }: { taskId: string; columnId: string }) => {
      const srcEl = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
      const dstEl = document.querySelector(`.column-tasks[data-column-id="${columnId}"]`);
      if (!srcEl || !dstEl) {
        throw new Error(`Drag source or drop target not found.`);
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

test.describe('ClickDown Comprehensive E2E Visual & Interaction Lifecycle', () => {
  const uniqueId = Date.now();
  const displayName = `Alex Comprehensive ${uniqueId}`;
  const testEmail = `comprehensive-user-${uniqueId}@example.com`;
  const testPassword = 'Password123!';
  const teamName = `Comprehensive Team ${uniqueId}`;
  const boardName = `Comprehensive Board ${uniqueId}`;
  const taskTitle = `Comprehensive Ticket ${uniqueId}`;

  const updatedTitle = `Redesigned Ticket ${uniqueId}`;
  const updatedDesc =
    'This ticket has been refined and detailed via automated comprehensive E2E tests.';

  test('should go through the full user registration, session state transitions, multi-detail ticket editing, dragging, and cascading deletions', async ({
    page,
  }) => {
    // Enable browser log mirroring
    page.on('pageerror', (err) => {
      console.error('BROWSER ERROR:', err);
    });
    page.on('console', (msg) => {
      console.log('BROWSER LOG:', msg.text());
    });

    // 1. Visit landing page
    await page.goto('/');
    await expect(page.locator('header nav strong a')).toContainText('ClickDown');

    // Header should show Login/Register when not authenticated
    await expect(page.locator('header nav')).toContainText('Login');
    await expect(page.locator('header nav')).toContainText('Register');

    // 2. Register new user
    await page.goto('/register');
    await page.fill('#displayName', displayName);
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');

    // Redirected to Dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.sidebar strong')).toContainText(displayName);

    // 2b. INTERACT: Update User Profile Details
    await page.click('.user-dropdown-trigger');
    await page.click('text=Profile Settings');
    await expect(page).toHaveURL('/profile');

    const updatedDisplayName = `Alex Updated ${uniqueId}`;
    const updatedEmail = `updated-user-${uniqueId}@example.com`;

    await page.fill('#displayName', updatedDisplayName);
    await page.fill('#email', updatedEmail);
    await page.fill('#profileCurrentPassword', testPassword);

    const profileSaveResponse = page.waitForResponse(
      (r) => r.url().endsWith('/profile') && r.request().method() === 'POST'
    );
    await page.click('button[type="submit"]:has-text("Save Profile Details")');
    await profileSaveResponse;
    // The flash toast only renders after the HX-Redirect completes.
    await expect(page.locator('.toast')).toContainText('Profile updated');

    // Assert profile details updated in the header and sidebar!
    await expect(page.locator('.user-dropdown-trigger')).toContainText(updatedDisplayName);
    await expect(page.locator('.sidebar strong')).toContainText(updatedDisplayName);
    await expect(page.locator('.sidebar small')).toContainText(updatedEmail);

    // 2c. INTERACT: Update User Password
    await page.goto('/profile');
    const newPassword = 'UpdatedPassword123!';
    await page.fill('#currentPassword', testPassword);
    await page.fill('#password', newPassword);
    await page.fill('#confirmPassword', newPassword);

    const passwordSaveResponse = page.waitForResponse(
      (r) => r.url().endsWith('/profile') && r.request().method() === 'POST'
    );
    await page.click('button[type="submit"]:has-text("Update Password")');
    await passwordSaveResponse;
    await expect(page.locator('.toast')).toContainText('Profile updated');

    // 2d. TRAVEL STATE & RE-AUTH: Logout and verify we can log back in with the new credentials!
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');

    await page.click('text=Login');
    await expect(page).toHaveURL('/login');

    await page.fill('#email', updatedEmail);
    await page.fill('#password', newPassword);
    await page.click('button[type="submit"]');

    // Should redirect back to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.sidebar strong')).toContainText(updatedDisplayName);

    // 3. TRAVEL STATE: Go back to Home Page '/' and verify shared login state!
    await page.goto('/');
    // User profile dropdown should be visible, NOT Login/Register links!
    await expect(page.locator('.user-dropdown-trigger')).toBeVisible();
    await expect(page.locator('.user-dropdown-trigger')).toContainText(updatedDisplayName);
    await expect(page.locator('header nav')).not.toContainText('Login');

    // 4. TRAVEL STATE: Attempt to visit '/login' and verify auto-redirect to dashboard
    await page.goto('/login');
    await expect(page).toHaveURL('/dashboard');

    // 5. TRAVEL STATE: Attempt to visit '/register' and verify auto-redirect to dashboard
    await page.goto('/register');
    await expect(page).toHaveURL('/dashboard');

    // 6. Create Team
    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.fill('#teamDescription', 'Highly cohesive E2E workspace');
    await page.click('button[type="submit"]:has-text("Create Team")');

    // Should redirect to the Team page
    await expect(page).toHaveURL(/\/teams\//);
    const teamPageUrl = page.url();
    await expect(page.locator('.team-header h1')).toContainText(teamName);

    // 7. Create Board
    await page.click('text=Create Board');
    await page.fill('#boardName', boardName);
    await page.fill('#boardDescription', 'High-end task board for visual review');
    await page.click('button[type="submit"]:has-text("Create Board")');

    // Should redirect to the Board page
    await expect(page).toHaveURL(/\/boards\//);
    const columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(4);

    // 8. Create Ticket (Task) inside the To Do column (index 1)
    const toDoColumn = columns.nth(1);
    await toDoColumn.locator('footer button').click();
    await page.fill('#taskTitle', taskTitle);
    await page.fill('#taskDescription', 'Initial boilerplate ticket details.');
    await page.selectOption('#taskPriority', 'medium');
    await page.click('button[type="submit"]:has-text("Create Task")');

    // Verify card is visible in column
    const taskCard = toDoColumn.locator('.task-card');
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator('h4')).toContainText(taskTitle);
    await expect(taskCard.locator('.priority-badge')).toContainText('medium');

    // Get task ID from data attributes
    const taskId = (await taskCard.getAttribute('data-task-id')) || '';
    expect(taskId).toBeTruthy();

    // 9. INTERACT: Click task card to open Details Modal
    await taskCard.click();
    const detailDialog = page.locator('dialog[open]');
    await expect(detailDialog).toBeVisible();

    // 10. INLINE EDIT: Title (assert save)
    const patchTitlePromise = page.waitForResponse(
      (response) => response.url().includes('/title') && response.request().method() === 'PATCH'
    );
    await detailDialog.locator('#taskTitleInput').fill(updatedTitle);
    await htmxTriggerChange(detailDialog.locator('#taskTitleInput'));
    await patchTitlePromise;

    // 11. INLINE EDIT: Description (assert save)
    const patchDescPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/description') && response.request().method() === 'PATCH'
    );
    await detailDialog.locator('#taskDescriptionInput').fill(updatedDesc);
    await htmxTriggerChange(detailDialog.locator('#taskDescriptionInput'));
    await patchDescPromise;

    // 12. INLINE EDIT: Priority (assert save)
    const patchPriorityPromise = page.waitForResponse(
      (response) => response.url().includes('/priority') && response.request().method() === 'PATCH'
    );
    await detailDialog.locator('#taskPrioritySelect').selectOption('urgent');
    await patchPriorityPromise;

    // 13. INLINE EDIT: Assignee (assert save)
    const patchAssigneePromise = page.waitForResponse(
      (response) => response.url().includes('/assignee') && response.request().method() === 'PATCH'
    );
    await detailDialog.locator('#taskAssigneeSelect').selectOption({ index: 1 }); // Select ourselves
    await patchAssigneePromise;

    // 14. INLINE EDIT: Due Date (assert save)
    const patchDueDatePromise = page.waitForResponse(
      (response) => response.url().includes('/dueDate') && response.request().method() === 'PATCH'
    );
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const dateString = targetDate.toISOString().split('T')[0] || '';
    await detailDialog.locator('#taskDueDateInput').fill(dateString);
    await htmxTriggerChange(detailDialog.locator('#taskDueDateInput'));
    await patchDueDatePromise;

    // Close the details modal
    await detailDialog.locator('button:has-text("Close")').click();
    await expect(detailDialog).not.toBeVisible();

    // Assert that the board card's text, priority badge, and avatar updated
    await expect(taskCard.locator('h4')).toContainText(updatedTitle);
    await expect(taskCard.locator('.priority-badge')).toContainText('urgent');
    await expect(taskCard.locator('.task-assignee img')).toBeVisible();

    // 15. INTERACT: Drag and Drop the task to the In Progress column (index 2)
    const inProgressColumn = columns.nth(2);
    const moveTaskPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/reorder') && response.request().method() === 'POST'
    );
    const inProgressColId = await inProgressColumn
      .locator('.column-tasks')
      .getAttribute('data-column-id');
    if (!taskId || !inProgressColId) throw new Error('Missing task or column ID');
    await dragAndDropTask(page, taskId, inProgressColId);
    await moveTaskPromise;

    // Verify task is now inside In Progress
    const movedCard = inProgressColumn.locator('.task-card', { hasText: updatedTitle });
    await expect(movedCard).toBeVisible();
    await expect(toDoColumn.locator('.task-card')).toHaveCount(0);

    // 16. RESOLVE: Open modal and delete the ticket
    await movedCard.click();
    await expect(detailDialog).toBeVisible();

    // Explicitly await the deletion redirect navigation to avoid race conditions
    const taskDeleteResponse = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await detailDialog.locator('button:has-text("Delete Task")').click();
    await taskDeleteResponse;

    // Wait for the client-side redirect and reload to complete
    await page.waitForLoadState('networkidle');

    await expect(detailDialog).not.toBeVisible();
    await expect(inProgressColumn.locator('.task-card')).toHaveCount(0);

    // 17. TRAVEL STATE: Go to team section
    await page.goto(teamPageUrl);
    await expect(page.locator('.team-header h1')).toContainText(teamName);

    // 18. RESOLVE: Delete Board
    await page.click(`text=${boardName}`);
    await expect(page).toHaveURL(/\/boards\//);
    await page.click('text=Edit Board');
    const boardEditDialog = page.locator('dialog[open]');
    await expect(boardEditDialog).toBeVisible();

    // Explicitly await board deletion reload
    const boardDeleteResponse = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await boardEditDialog.locator('button:has-text("Delete Board")').click();
    await boardDeleteResponse;
    await page.waitForLoadState('networkidle');

    await expect(boardEditDialog).not.toBeVisible();

    // Should redirect back to Team Page
    await expect(page).toHaveURL(/\/teams\//);
    await expect(page.locator('.team-meta')).toContainText('0 boards');

    // 19. RESOLVE: Delete Team
    await page.click('text=Edit Team');
    const teamEditDialog = page.locator('dialog[open]');
    await expect(teamEditDialog).toBeVisible();

    // Explicitly await team deletion reload
    const teamDeleteResponse = page.waitForResponse(
      (response) => response.url().includes('/delete') && response.request().method() === 'POST'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await teamEditDialog.locator('button:has-text("Delete Team")').click();
    await teamDeleteResponse;
    await page.waitForLoadState('networkidle');

    await expect(teamEditDialog).not.toBeVisible();

    // Should redirect back to Dashboard
    await expect(page).toHaveURL('/dashboard');

    // 20. RESOLVE: Logout using profile dropdown menu
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');

    // Header should revert to Login/Register options
    await expect(page.locator('header nav')).toContainText('Login');
    await expect(page.locator('header nav')).toContainText('Register');
  });
});
