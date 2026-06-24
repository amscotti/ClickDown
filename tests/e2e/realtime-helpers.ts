import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const PASSWORD = 'Password123!';

export interface RealtimeUser {
  page: Page;
  context: BrowserContext;
  userId: string;
  displayName: string;
}

export interface RealtimePair {
  owner: RealtimeUser;
  member: RealtimeUser;
  teamSlug: string;
  boardSlug: string;
  boardUrl: string;
}

async function registerUser(
  browser: Browser,
  uniqueId: number,
  role: 'owner' | 'member'
): Promise<RealtimeUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const displayName = role === 'owner' ? `RT Owner ${uniqueId}` : `RT Member ${uniqueId}`;
  const email = `rt-${role}-${uniqueId}@example.com`;

  await page.goto('/register');
  await page.fill('#displayName', displayName);
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');

  return { page, context, userId: '', displayName };
}

export async function bootstrapRealtimePair(
  browser: Browser,
  uniqueId: number
): Promise<RealtimePair> {
  const owner = await registerUser(browser, uniqueId, 'owner');

  await owner.page.click('text=Create Your First Team');
  await owner.page.fill('#teamName', `RT Team ${uniqueId}`);
  await owner.page.click('button[type="submit"]:has-text("Create Team")');

  await owner.page.click('text=Create Board');
  await owner.page.fill('#boardName', `RT Board ${uniqueId}`);
  await owner.page.click('button[type="submit"]:has-text("Create Board")');
  await expect(owner.page.locator('.kanban-board')).toBeVisible({ timeout: 15000 });

  const teamSlug = `rt-team-${uniqueId}`;
  const boardSlug = `rt-board-${uniqueId}`;
  const boardUrl = `/teams/${teamSlug}/boards/${boardSlug}`;

  // Capture invite link (includes secret token — slug alone is not enough)
  await owner.page.goto(`/teams/${teamSlug}`);
  await owner.page.click('text=Invite Members');
  const inviteLink = await owner.page.locator('#invite-link').inputValue();
  await owner.page.locator('dialog[open] button:has-text("Done")').click();

  const member = await registerUser(browser, uniqueId, 'member');
  await member.page.click('button:has-text("Join a Team")');
  const joinDialog = member.page.locator('dialog[open]');
  await expect(joinDialog).toBeVisible();
  await joinDialog.locator('#teamSlug').fill(inviteLink);
  await joinDialog.locator('button[type="submit"]:has-text("Join Team")').click();
  await expect(member.page).toHaveURL(new RegExp(`/teams/${teamSlug}`));

  return { owner, member, teamSlug, boardSlug, boardUrl };
}

export async function awaitWsOpen(page: Page, boardUrl: string): Promise<void> {
  await page.goto(boardUrl);
  await expect(page.locator('.kanban-board')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.presence-bar')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[ws-connect]');
      if (!el) return false;
      const win = window as Window & { htmx?: unknown };
      return !!win.htmx;
    },
    undefined,
    { timeout: 15000 }
  );
}

export async function readCurrentUserId(page: Page): Promise<string> {
  return (await page.locator('.presence-bar').getAttribute('data-current-user-id')) ?? '';
}
