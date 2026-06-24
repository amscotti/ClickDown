import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Reliably fire an HTMX inline-edit request for a modal field.
 *
 * Playwright's synthetic `fill()` + `blur()` can race with HTMX wiring up event
 * handlers on freshly-swapped modal content: the `change` event is dispatched
 * before HTMX's listener is attached, so the request never fires and a paired
 * `waitForResponse` hangs. Calling `htmx.trigger()` invokes HTMX's own listener
 * directly, sidestepping the race entirely.
 */
export async function htmxTriggerChange(locator: Locator): Promise<void> {
  await locator.evaluate((el: Element) => {
    const win = window as Window & {
      htmx?: {
        process: (elt: Element) => void;
        trigger: (elt: Element, name: string) => void;
      };
    };
    if (!win.htmx) throw new Error('HTMX is not loaded');
    win.htmx.process(el);
    win.htmx.trigger(el, 'change');
  });
}

/**
 * Shared setup for board-level e2e tests: register a fresh user, create a team
 * and board, and return the key locators/ids. Keeps individual feature tests
 * short and independent.
 */
export async function setupBoard(
  page: Page,
  uniqueId: number,
  opts: { withTask?: boolean } = {}
): Promise<{
  teamSlug: string;
  boardSlug: string;
  toDoColumn: Locator;
  taskId?: string;
}> {
  const password = 'Password123!';
  await page.goto('/register');
  await page.fill('#displayName', `User ${uniqueId}`);
  await page.fill('#email', `feat-${uniqueId}@example.com`);
  await page.fill('#password', password);
  await page.fill('#confirmPassword', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');

  const teamName = `Feature Team ${uniqueId}`;
  await page.click('text=Create Your First Team');
  await page.fill('#teamName', teamName);
  await page.click('button[type="submit"]:has-text("Create Team")');

  const boardName = `Feature Board ${uniqueId}`;
  await page.click('text=Create Board');
  await expect(page.locator('#boardName')).toBeVisible({ timeout: 10000 });
  await page.fill('#boardName', boardName);
  await Promise.all([
    page.waitForURL(/\/boards\//, { timeout: 20000 }),
    page.click('button[type="submit"]:has-text("Create Board")'),
  ]);

  // Wait for the board page to load and columns to render.
  await expect(page.locator('.kanban-board')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.kanban-column')).toHaveCount(4, { timeout: 20000 });

  const teamSlug = `feature-team-${uniqueId}`;
  const boardSlug = `feature-board-${uniqueId}`;
  const toDoColumn = page.locator('.kanban-column').nth(1);

  let taskId: string | undefined;
  if (opts.withTask) {
    await toDoColumn.locator('footer button').click();
    await expect(page.locator('#taskTitle')).toBeVisible({ timeout: 10000 });
    await page.fill('#taskTitle', `Feature Task ${uniqueId}`);
    await Promise.all([
      page.waitForURL(/\/boards\//, { timeout: 20000 }),
      page.click('button[type="submit"]:has-text("Create Task")'),
    ]);
    // After HX-Redirect the board reloads — re-query columns (old locators detach).
    await expect(page.locator('.kanban-board')).toBeVisible({ timeout: 20000 });
    const toDoAfter = page.locator('.kanban-column').nth(1);
    await expect(toDoAfter.locator('.task-card').first()).toBeVisible({ timeout: 20000 });
    taskId = (await toDoAfter.locator('.task-card').first().getAttribute('data-task-id')) ?? '';
  }

  // Fresh locators post any redirects
  return {
    teamSlug,
    boardSlug,
    toDoColumn: page.locator('.kanban-column').nth(1),
    taskId,
  };
}
