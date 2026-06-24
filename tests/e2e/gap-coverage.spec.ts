import { expect, test } from '@playwright/test';
import { htmxTriggerChange, setupBoard } from './helpers';

test.describe('Profile editing', () => {
  test('updates display name and email', async ({ page }) => {
    const uid = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', `Profile User ${uid}`);
    await page.fill('#email', `profile-${uid}@example.com`);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/profile');
    await expect(page.locator('h1')).toContainText('Profile Settings');

    await page.fill('#displayName', `Updated Name ${uid}`);
    await page.fill('#email', `updated-${uid}@example.com`);
    await page.fill('#profileCurrentPassword', 'Password123!');
    await page.click('button:has-text("Save Profile Details")');

    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.locator('#displayName')).toHaveValue(`Updated Name ${uid}`);
    await expect(page.locator('#email')).toHaveValue(`updated-${uid}@example.com`);
  });

  test('changes the password successfully', async ({ page }) => {
    const uid = Date.now();
    const oldPassword = 'Password123!';
    const newPassword = 'NewPass456!';

    await page.goto('/register');
    await page.fill('#displayName', `Pwd User ${uid}`);
    await page.fill('#email', `pwd-${uid}@example.com`);
    await page.fill('#password', oldPassword);
    await page.fill('#confirmPassword', oldPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/profile');
    await page.fill('#currentPassword', oldPassword);
    await page.fill('#password', newPassword);
    await page.fill('#confirmPassword', newPassword);
    await page.click('button:has-text("Update Password")');

    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/profile');

    await page.evaluate(() => {
      const form = document.querySelector('form[action="/logout"]') as HTMLFormElement;
      form?.submit();
    });
    await page.waitForURL('**/');
    await page.goto('/login');
    await page.fill('#email', `pwd-${uid}@example.com`);
    await page.fill('#password', newPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('rejects password change without the current password', async ({ page }) => {
    const uid = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', `Pwd Bad ${uid}`);
    await page.fill('#email', `pwd-bad-${uid}@example.com`);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await page.goto('/profile');
    // Leave currentPassword empty — browser required attr may block submit;
    // clear it and use novalidate to exercise the server-side check.
    await page.evaluate(() => {
      for (const f of document.querySelectorAll('form')) {
        f.setAttribute('novalidate', 'true');
      }
    });
    await page.fill('#password', 'NewPass456!');
    await page.fill('#confirmPassword', 'NewPass456!');
    await page.locator('button:has-text("Update Password")').click();

    await expect(page.locator('#password-errors')).toContainText(/[Cc]urrent password/, {
      timeout: 10000,
    });
  });
});

test.describe('Theme toggle', () => {
  test('toggles between light and dark mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('persists theme choice across navigation', async ({ page }) => {
    await page.goto('/');
    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('Column color customization', () => {
  test('sets a custom column color via the edit modal', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);

    await toDoColumn.locator('.column-menu-btn').click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();

    await dialog.locator('#columnColor').evaluate((el: HTMLInputElement) => {
      el.value = '#ff0000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await dialog.locator('button[type="submit"]:has-text("Save Changes")').click();
    await page.waitForLoadState('networkidle');

    await toDoColumn.locator('.column-menu-btn').click();
    const editDialog = page.locator('dialog[open]');
    await expect(editDialog.locator('#columnColor')).toHaveValue('#ff0000');
  });
});

test.describe('Board description editing', () => {
  test('updates board description via the edit modal', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid);

    await page.click('text=Edit Board');
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();

    const desc = `Updated description ${uid}`;
    await dialog.locator('#boardDescription').fill(desc);
    await dialog.locator('button[type="submit"]:has-text("Save Changes")').click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.board-header p')).toContainText(desc);
  });
});

test.describe('Due date overdue visual state', () => {
  test('marks a task with a past due date as overdue', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn, taskId } = await setupBoard(page, uid, { withTask: true });
    expect(taskId).toBeTruthy();

    await toDoColumn.locator('.task-card').first().click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    await modal.locator('#taskDueDateInput').fill('2000-01-01');
    const dueResponse = page.waitForResponse(
      (response) => response.url().includes('/dueDate') && response.request().method() === 'PATCH'
    );
    await htmxTriggerChange(modal.locator('#taskDueDateInput'));
    await dueResponse;
    await page.reload();
    const dueBadge = toDoColumn.locator('.task-due-date.overdue').first();
    await expect(dueBadge).toBeVisible({ timeout: 10000 });
  });
});

test.describe('WIP limit visual warning', () => {
  test('shows wip-exceeded when tasks exceed the limit', async ({ page }) => {
    const uid = Date.now();
    const { toDoColumn } = await setupBoard(page, uid);

    await toDoColumn.locator('.column-menu-btn').click();
    const dialog = page.locator('dialog[open]');
    await dialog.locator('#columnWipLimit').fill('1');
    await dialog.locator('button[type="submit"]:has-text("Save Changes")').click();
    await page.waitForLoadState('networkidle');

    for (let i = 0; i < 2; i++) {
      await toDoColumn.locator('footer button').click();
      await page.fill('#taskTitle', `WIP Task ${i} ${uid}`);
      await page.click('button[type="submit"]:has-text("Create Task")');
      await expect(toDoColumn.locator('.task-card').first()).toBeVisible({ timeout: 15000 });
    }

    await expect(toDoColumn).toHaveClass(/wip-exceeded/, { timeout: 10000 });
  });
});

test.describe('Empty states', () => {
  test('board with no tasks shows empty state in columns', async ({ page }) => {
    const uid = Date.now();
    await setupBoard(page, uid);

    await expect(page.locator('.empty-column').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.empty-column').first()).toContainText(/No tasks yet/i);
  });

  test('dashboard with no teams shows onboarding prompt', async ({ page }) => {
    const uid = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', `Empty User ${uid}`);
    await page.fill('#email', `empty-${uid}@example.com`);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await expect(page.locator('text=Create Your First Team')).toBeVisible();
  });
});
