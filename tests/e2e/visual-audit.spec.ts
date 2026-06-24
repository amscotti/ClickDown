import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

test.describe('ClickDown Visual Design Audit Screenshots', () => {
  const screenshotsDir = path.resolve('./screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('should capture high-resolution screenshots of all major application views', async ({
    page,
  }) => {
    const uniqueId = Date.now();
    const testEmail = `visual-user-${uniqueId}@example.com`;
    const testPassword = 'Password123!';
    const teamName = `Design Audit Team ${uniqueId}`;
    const boardName = `Audit Board ${uniqueId}`;
    const taskTitle = `Audit Card ${uniqueId}`;

    // Set high-resolution viewport for screenshots
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Landing Page (Unauthenticated)
    await page.goto('/');
    await page.screenshot({ path: path.join(screenshotsDir, '01_landing_page.png') });

    // 2. Login Page
    await page.goto('/login');
    await page.screenshot({ path: path.join(screenshotsDir, '02_login_page.png') });

    // 3. Register Page
    await page.goto('/register');
    await page.screenshot({ path: path.join(screenshotsDir, '03_register_page.png') });

    // Register user
    await page.fill('#displayName', 'Tony Designer');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // 4. Dashboard Page (Empty State / Sidebar card fixed)
    await page.screenshot({ path: path.join(screenshotsDir, '04_dashboard_page.png') });

    // Create Team
    await page.click('text=Create Your First Team');
    await page.fill('#teamName', teamName);
    await page.fill('#teamDescription', 'Continuous visual design review workspace');
    await page.click('button[type="submit"]:has-text("Create Team")');
    await expect(page).toHaveURL(/\/teams\//);

    const teamUrl = page.url();

    // 5. Team Page
    await page.screenshot({ path: path.join(screenshotsDir, '05_team_page.png') });

    // 6. User Profile Settings Page
    await page.goto('/profile');
    await expect(page).toHaveURL('/profile');
    await page.screenshot({ path: path.join(screenshotsDir, '06_profile_settings_page.png') });

    // Navigate back to Team Page and Create Board
    await page.goto(teamUrl);
    await page.click('text=Create Board');
    await page.fill('#boardName', boardName);
    await page.fill('#boardDescription', 'Design auditing backlog');
    await page.click('button[type="submit"]:has-text("Create Board")');
    await expect(page).toHaveURL(/\/boards\//);

    // 7. Board Page (Empty State / Lock horizontal scrollbar)
    await page.screenshot({ path: path.join(screenshotsDir, '07_board_page.png') });

    // Create Task
    const columns = page.locator('.kanban-column');
    const toDoCol = columns.nth(1);
    await toDoCol.locator('footer button').click();
    await page.fill('#taskTitle', taskTitle);
    await page.fill('#taskDescription', 'Task details for visual layout evaluation');
    await page.selectOption('#taskPriority', 'high');
    await page.click('button[type="submit"]:has-text("Create Task")');
    await expect(toDoCol.locator('.task-card')).toBeVisible();

    // 8. Board Page with Task Card
    await page.screenshot({ path: path.join(screenshotsDir, '08_board_with_tasks_page.png') });

    // Click task card to open modal
    await toDoCol.locator('.task-card').click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();

    // 9. Task Detail Modal View
    await page.screenshot({ path: path.join(screenshotsDir, '09_task_detail_modal.png') });
  });
});
