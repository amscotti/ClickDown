import { expect, test } from '@playwright/test';

test('capture MCP token UI', async ({ page }) => {
  const uid = Date.now();
  await page.goto('/register');
  await page.fill('#displayName', `Visual ${uid}`);
  await page.fill('#email', `visual-${uid}@example.com`);
  await page.fill('#password', 'Password123!');
  await page.fill('#confirmPassword', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');

  await page.goto('/profile');
  await page.locator('summary', { hasText: 'Setup: connect Claude Code' }).click();
  await page.fill('input[name="name"]', 'visual-agent');
  await page.click('button:has-text("Create Token")');
  await page.locator('#new-api-token').waitFor();
  await page.locator('summary', { hasText: 'Setup: connect Claude Code' }).click();
  await page
    .locator('.card', { hasText: 'API Tokens (MCP)' })
    .screenshot({ path: 'test-results/mcp-token-ui.png' });
});
