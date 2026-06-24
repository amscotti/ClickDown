import { expect, test } from '@playwright/test';
import { htmxTriggerChange } from './helpers';
import { awaitWsOpen, bootstrapRealtimePair, type RealtimePair } from './realtime-helpers';

test.describe('Real-time collaboration (WebSocket)', () => {
  let pair: RealtimePair;

  test.beforeAll(async ({ browser }) => {
    pair = await bootstrapRealtimePair(browser, Date.now());
  });

  test.afterAll(async () => {
    await pair.owner.context.close().catch(() => {});
    await pair.member.context.close().catch(() => {});
  });

  test('task created by owner appears live on member via WS broadcast', async () => {
    await awaitWsOpen(pair.member.page, pair.boardUrl);
    await awaitWsOpen(pair.owner.page, pair.boardUrl);

    const memberTodo = pair.member.page.locator('.kanban-column').nth(1);
    const ownerTodo = pair.owner.page.locator('.kanban-column').nth(1);
    const taskTitle = `Live Task ${Date.now()}`;

    await ownerTodo.locator('footer button').click();
    await pair.owner.page.fill('#taskTitle', taskTitle);

    const [createResp] = await Promise.all([
      pair.owner.page.waitForResponse(
        (r) => r.url().includes('/tasks') && r.request().method() === 'POST'
      ),
      pair.owner.page.click('button[type="submit"]:has-text("Create Task")'),
    ]);
    expect(createResp.ok()).toBeTruthy();

    await expect(memberTodo.locator('.task-card', { hasText: taskTitle }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('task title edited by owner updates live on member', async () => {
    await awaitWsOpen(pair.member.page, pair.boardUrl);
    await awaitWsOpen(pair.owner.page, pair.boardUrl);

    const ownerTodo = pair.owner.page.locator('.kanban-column').nth(1);

    const seedTitle = `Edit Seed ${Date.now()}`;
    await ownerTodo.locator('footer button').click();
    await pair.owner.page.fill('#taskTitle', seedTitle);
    const [seedResp] = await Promise.all([
      pair.owner.page.waitForResponse(
        (r) => r.url().includes('/tasks') && r.request().method() === 'POST'
      ),
      pair.owner.page.click('button[type="submit"]:has-text("Create Task")'),
    ]);
    expect(seedResp.ok()).toBeTruthy();

    const memberTodo = pair.member.page.locator('.kanban-column').nth(1);
    await expect(memberTodo.locator('.task-card', { hasText: seedTitle }).first()).toBeVisible({
      timeout: 15000,
    });

    const taskId = await ownerTodo
      .locator('.task-card', { hasText: seedTitle })
      .first()
      .getAttribute('data-task-id');
    expect(taskId).toBeTruthy();

    const newTitle = `Renamed ${Date.now()}`;

    await pair.owner.page.locator(`[data-task-id="${taskId}"]`).first().click();
    const modal = pair.owner.page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    const titleInput = modal.locator('#taskTitleInput');
    await titleInput.fill(newTitle);

    const [patchResp] = await Promise.all([
      pair.owner.page.waitForResponse(
        (r) => r.url().includes('/title') && r.request().method() === 'PATCH'
      ),
      htmxTriggerChange(titleInput),
    ]);
    expect(patchResp.ok()).toBeTruthy();

    await expect(pair.member.page.locator(`[data-task-id="${taskId}"]`).first()).toContainText(
      newTitle,
      { timeout: 15000 }
    );
  });

  test('task deleted by owner disappears from member board', async () => {
    await awaitWsOpen(pair.member.page, pair.boardUrl);
    await awaitWsOpen(pair.owner.page, pair.boardUrl);

    const ownerTodo = pair.owner.page.locator('.kanban-column').nth(1);

    const taskTitle = `Delete Me ${Date.now()}`;
    await ownerTodo.locator('footer button').click();
    await pair.owner.page.fill('#taskTitle', taskTitle);
    const [seedResp] = await Promise.all([
      pair.owner.page.waitForResponse(
        (r) => r.url().includes('/tasks') && r.request().method() === 'POST'
      ),
      pair.owner.page.click('button[type="submit"]:has-text("Create Task")'),
    ]);
    expect(seedResp.ok()).toBeTruthy();

    const taskId = await ownerTodo
      .locator('.task-card', { hasText: taskTitle })
      .first()
      .getAttribute('data-task-id');
    expect(taskId).toBeTruthy();

    await expect(pair.member.page.locator(`[data-task-id="${taskId}"]`)).toBeVisible({
      timeout: 15000,
    });

    await pair.owner.page.locator(`[data-task-id="${taskId}"]`).first().click();
    const modal = pair.owner.page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    pair.owner.page.once('dialog', (dialog) => dialog.accept());

    const [deleteResp] = await Promise.all([
      pair.owner.page.waitForResponse(
        (r) => r.url().includes('/delete') && r.request().method() === 'POST'
      ),
      modal.locator('button:has-text("Delete Task")').click(),
    ]);
    expect(deleteResp.ok()).toBeTruthy();

    await expect(pair.member.page.locator(`[data-task-id="${taskId}"]`)).toHaveCount(0, {
      timeout: 15000,
    });
  });

  test('owner joining board appears in member presence bar', async () => {
    // Start with the owner off the board so the member's roster is empty.
    await pair.owner.page.goto('/dashboard');
    await awaitWsOpen(pair.member.page, pair.boardUrl);

    await expect(pair.member.page.locator('.presence-avatar')).toHaveCount(0);

    await awaitWsOpen(pair.owner.page, pair.boardUrl);

    await expect(pair.member.page.locator('.presence-avatar')).toHaveCount(1, { timeout: 15000 });
  });

  test('column added by owner forces member page reload', async () => {
    await awaitWsOpen(pair.member.page, pair.boardUrl);
    await awaitWsOpen(pair.owner.page, pair.boardUrl);

    const columnsBefore = await pair.member.page.locator('.kanban-column').count();

    await pair.owner.page.click('text=Add Column');
    const dialog = pair.owner.page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    await dialog.locator('#columnName').fill(`New Col ${Date.now()}`);
    await dialog.locator('button[type="submit"]:has-text("Add Column")').click();

    await expect(pair.member.page.locator('.kanban-column')).toHaveCount(columnsBefore + 1, {
      timeout: 15000,
    });
  });

  test('presence roster: a viewer joining later sees users who connected before them', async () => {
    // Owner connects first, then member navigates in — the member must see the
    // owner's avatar immediately, without waiting for another presence event.
    await awaitWsOpen(pair.owner.page, pair.boardUrl);
    await pair.member.page.goto(pair.boardUrl);
    await expect(pair.member.page.locator('.kanban-board')).toBeVisible({ timeout: 15000 });

    await expect(pair.member.page.locator('.presence-avatar')).toHaveCount(1, { timeout: 15000 });
  });

  test('board refresh is deferred while a task modal is open, then applied on close', async ({
    page: _page,
  }) => {
    await awaitWsOpen(pair.member.page, pair.boardUrl);
    await awaitWsOpen(pair.owner.page, pair.boardUrl);

    // Seed a task so the member has a modal to open.
    const ownerTodo = pair.owner.page.locator('.kanban-column').nth(1);
    const seedTitle = `Defer Seed ${Date.now()}`;
    await ownerTodo.locator('footer button').click();
    await pair.owner.page.fill('#taskTitle', seedTitle);
    await pair.owner.page.click('button[type="submit"]:has-text("Create Task")');
    const memberTodo = pair.member.page.locator('.kanban-column').nth(1);
    await expect(memberTodo.locator('.task-card', { hasText: seedTitle }).first()).toBeVisible({
      timeout: 15000,
    });

    // Member opens the task modal.
    await memberTodo.locator('.task-card', { hasText: seedTitle }).first().click();
    const modal = pair.member.page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    const urlWithModal = pair.member.page.url();

    // Owner creates another task → board-refresh broadcast arrives at member.
    const secondTitle = `Defer Second ${Date.now()}`;
    await ownerTodo.locator('footer button').click();
    await pair.owner.page.fill('#taskTitle', secondTitle);
    await pair.owner.page.click('button[type="submit"]:has-text("Create Task")');

    // Member's modal must NOT be destroyed by a reload; they get an info toast instead.
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('.toast')).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('.toast')).toContainText('changed elsewhere');
    expect(pair.member.page.url()).toBe(urlWithModal);

    // Closing the modal flushes the pending refresh; the new task appears.
    await modal.locator('button:has-text("Close")').click();
    await expect(
      pair.member.page.locator('.task-card', { hasText: secondTitle }).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('owner leaving board disappears from member presence bar', async () => {
    await awaitWsOpen(pair.member.page, pair.boardUrl);
    await awaitWsOpen(pair.owner.page, pair.boardUrl);

    await expect(pair.member.page.locator('.presence-avatar')).toHaveCount(1, { timeout: 15000 });

    await pair.owner.page.evaluate(() => {
      const form = document.querySelector('form[action="/logout"]') as HTMLFormElement;
      form?.submit();
    });
    await pair.owner.page.waitForURL('**/', { timeout: 15000 }).catch(() => {});

    await expect(pair.member.page.locator('.presence-avatar')).toHaveCount(0, { timeout: 15000 });
  });
});
