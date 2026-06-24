import { expect, type Page, test } from '@playwright/test';
import { htmxTriggerChange, setupBoard } from './helpers';

// Simulate HTML5 drag-and-drop of one column onto another.
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
      srcHandle.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer })
      );
      dataTransfer.setData('text/plain', sourceId);
      dataTransfer.setData('drag-type', 'column');
      targetCol.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })
      );
      targetCol.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })
      );
      srcHandle.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer })
      );
    },
    { sourceId: sourceColumnId, targetId: targetColumnId }
  );
}

test.describe('Board hardening regressions', () => {
  test('search/filter keeps a single board root and column reorder works afterwards', async ({
    page,
  }) => {
    const uid = Date.now();
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await setupBoard(page, uid, { withTask: true });
    await expect(page.locator('.kanban-board')).toHaveCount(1);

    // Search — previously nested .kanban-board inside itself.
    const searchResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/boards/') &&
        !r.url().includes('/columns') &&
        r.request().method() === 'GET'
    );
    await page.locator('.board-search').fill(`Feature Task ${uid}`);
    await searchResponse;
    await expect(page.locator('.kanban-board')).toHaveCount(1);
    await expect(
      page.locator('.task-card', { hasText: `Feature Task ${uid}` }).first()
    ).toBeVisible({ timeout: 10000 });

    // Drag Done onto Backlog while the search filter is active — this used to
    // throw an uncaught NotFoundError and silently desync from the server.
    const columns = page.locator('.kanban-column');
    const backlogId = (await columns.nth(0).getAttribute('data-column-id')) ?? '';
    const doneId = (await columns.nth(3).getAttribute('data-column-id')) ?? '';
    expect(backlogId).toBeTruthy();
    expect(doneId).toBeTruthy();

    const reorderResponse = page.waitForResponse(
      (r) => r.url().includes('/columns/reorder') && r.request().method() === 'POST'
    );
    await dragColumnOnto(page, doneId, backlogId);
    await reorderResponse;

    await expect(page.locator('.kanban-column').nth(0).locator('h3')).toContainText('Done', {
      timeout: 10000,
    });

    await page.reload();
    await expect(page.locator('.kanban-column').nth(0).locator('h3')).toContainText('Done');
    expect(pageErrors).toEqual([]);
  });

  test('inline-edit success toast is visible while the task modal is open', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid, { withTask: true });

    await toDoColumn.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    const titleInput = modal.locator('#taskTitleInput');
    await titleInput.fill(`Renamed ${uid}`);
    const patch = page.waitForResponse(
      (r) => r.url().includes('/title') && r.request().method() === 'PATCH'
    );
    await htmxTriggerChange(titleInput);
    await patch;

    // The toast must render inside the top-layer dialog, not behind it.
    await expect(modal.locator('.toast')).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('.toast')).toContainText('Title updated');
  });

  test('inline-edit validation failure keeps the dialog and shows an error toast', async ({
    page,
  }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid, { withTask: true });

    await toDoColumn.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    const titleInput = modal.locator('#taskTitleInput');
    await titleInput.fill('x'); // below min length
    const patch = page.waitForResponse(
      (r) => r.url().includes('/title') && r.request().method() === 'PATCH'
    );
    await htmxTriggerChange(titleInput);
    const res = await patch;
    expect(res.status()).toBe(400);

    await expect(modal.locator('.toast.error')).toBeVisible({ timeout: 5000 });
    await expect(modal).toBeVisible(); // dialog stays open and usable
    await expect(titleInput).toBeVisible();
  });

  test('offline column loads surface an error toast instead of hanging silently', async ({
    page,
  }) => {
    const uid = Date.now();
    await setupBoard(page, uid);

    await page.route('**/columns/*/tasks**', (route) => route.abort());
    await page.reload();

    await expect(page.locator('.toast.error').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.toast.error').first()).toContainText('Connection lost');
    await page.unroute('**/columns/*/tasks**');
  });

  test('comment authors can delete their own comments', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid, { withTask: true });

    await toDoColumn.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    const commentResponse = page.waitForResponse(
      (r) => r.url().includes('/comments') && r.request().method() === 'POST'
    );
    await modal.locator('textarea[name="body"]').fill(`Temporary comment ${uid}`);
    await modal.locator('button:has-text("Comment")').click();
    await commentResponse;

    const comment = modal.locator('.task-comment', { hasText: `Temporary comment ${uid}` });
    await expect(comment).toBeVisible({ timeout: 10000 });

    page.once('dialog', (dialog) => dialog.accept());
    await comment.locator('button:has-text("Delete")').click();
    await expect(comment).toHaveCount(0, { timeout: 10000 });
  });

  test('profile save shows a success toast after the redirect', async ({ page }) => {
    const uid = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', `Toast User ${uid}`);
    await page.fill('#email', `toast-${uid}@example.com`);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/profile');
    await page.fill('#displayName', `Toast Renamed ${uid}`);
    await page.click('button:has-text("Save Profile Details")');

    await expect(page).toHaveURL('/profile');
    await expect(page.locator('.toast')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.toast')).toContainText('Profile updated');
  });
});
