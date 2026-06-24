import { expect, test } from '@playwright/test';

test.describe('API tokens (MCP)', () => {
  test('create token, use it against /api/mcp, then revoke it', async ({ page, request }) => {
    const uid = Date.now();
    await page.goto('/register');
    await page.fill('#displayName', `Token User ${uid}`);
    await page.fill('#email', `token-${uid}@example.com`);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Create a token via the profile UI
    await page.goto('/profile');
    await expect(page.locator('h3', { hasText: 'API Tokens (MCP)' })).toBeVisible();
    await page.fill('input[name="name"]', 'e2e-agent');
    await page.click('button:has-text("Create Token")');

    // Token is shown exactly once
    const tokenEl = page.locator('#new-api-token');
    await expect(tokenEl).toBeVisible();
    const token = (await tokenEl.textContent())?.trim() ?? '';
    expect(token.startsWith('cd_')).toBe(true);

    // A ready-to-paste Claude Code command is shown with the token pre-filled
    const cmdEl = page.locator('#new-token-command');
    await expect(cmdEl).toBeVisible();
    const cmd = (await cmdEl.textContent())?.trim() ?? '';
    expect(cmd).toContain('claude mcp add --transport http clickdown');
    expect(cmd).toContain('/api/mcp');
    expect(cmd).toContain(token);

    // Setup guide exists for other clients
    await expect(page.locator('summary', { hasText: 'Setup: connect Claude Code' })).toBeVisible();

    // The token appears in the list (prefix only)
    await expect(page.locator('td', { hasText: 'e2e-agent' })).toBeVisible();

    // Use the token against the MCP endpoint
    const mcpRes = await request.post('/api/mcp', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_teams' } },
    });
    expect(mcpRes.ok()).toBe(true);
    const body = await mcpRes.json();
    expect(body.result.content[0].text).toContain('teams');

    // Revoke the token
    page.on('dialog', (d) => d.accept());
    await page.click('button:has-text("Revoke")');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('td', { hasText: 'e2e-agent' })).toHaveCount(0);

    // Revoked token no longer works
    const revokedRes = await request.post('/api/mcp', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      data: { jsonrpc: '2.0', id: 1, method: 'ping' },
    });
    expect(revokedRes.status()).toBe(401);
  });
});
