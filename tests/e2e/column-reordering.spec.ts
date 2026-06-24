import { expect, type Page, test } from '@playwright/test';

// Simulate HTML5 drag-and-drop of one column onto another.
// The app listens for 'column' drags via dataTransfer and reorders server-side.
async function dragColumnOnto(page: Page, sourceColumnId: string, targetColumnId: string) {
  await page.evaluate(
    ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const srcHandle = document.querySelector(
        `.kanban-column[data-column-id="${sourceId}"] .column-drag-handle`
      );
      const targetCol = document.querySelector(`.kanban-column[data-column-id="${targetId}"]`);
      if (!srcHandle || !targetCol) {
        throw new Error('Source handle or target column not found');
      }

      const dataTransfer = new DataTransfer();

      const dragStart = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      srcHandle.dispatchEvent(dragStart);

      dataTransfer.setData('text/plain', sourceId);
      dataTransfer.setData('drag-type', 'column');

      const dragOver = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      targetCol.dispatchEvent(dragOver);

      const drop = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      targetCol.dispatchEvent(drop);

      const dragEnd = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      srcHandle.dispatchEvent(dragEnd);
    },
    { sourceId: sourceColumnId, targetId: targetColumnId }
  );
}

test.describe('ClickDown E2E Column Reordering', () => {
  const testPassword = 'Password123!';

  test('should persist a new column order after dragging a column to a new position', async ({
    page,
  }) => {
    const uniqueId = Date.now();

    await page.goto('/register');
    await page.fill('#displayName', 'Alex Columns');
    await page.fill('#email', `columns-${uniqueId}@example.com`);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.click('text=Create Your First Team');
    await page.fill('#teamName', `Column Team ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Team")');

    await page.click('text=Create Board');
    await expect(page.locator('#boardName')).toBeVisible();
    await page.fill('#boardName', `Column Board ${uniqueId}`);
    await Promise.all([
      page.waitForURL(/\/boards\//, { timeout: 20000 }),
      page.click('button[type="submit"]:has-text("Create Board")'),
    ]);
    await expect(page).toHaveURL(/\/boards\//);

    // Default order
    const columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(4);
    await expect(columns.nth(0).locator('h3')).toContainText('Backlog');
    await expect(columns.nth(3).locator('h3')).toContainText('Done');

    const backlogId = (await columns.nth(0).getAttribute('data-column-id')) ?? '';
    const doneId = (await columns.nth(3).getAttribute('data-column-id')) ?? '';
    expect(backlogId).toBeTruthy();
    expect(doneId).toBeTruthy();

    // Drag "Done" onto "Backlog" -> Done should become first
    const reorderPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/columns/reorder') && response.request().method() === 'POST'
    );
    await dragColumnOnto(page, doneId, backlogId);
    await reorderPromise;

    // Reload to read the persisted order from the server
    await page.reload();
    await expect(page.locator('.kanban-column')).toHaveCount(4);

    const reordered = page.locator('.kanban-column');
    await expect(reordered.nth(0).locator('h3')).toContainText('Done');
    await expect(reordered.nth(1).locator('h3')).toContainText('Backlog');
    await expect(reordered.nth(2).locator('h3')).toContainText('To Do');
    await expect(reordered.nth(3).locator('h3')).toContainText('In Progress');
  });
});
