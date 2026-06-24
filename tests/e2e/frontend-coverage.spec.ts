import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

interface CoverageRange {
  startOffset: number;
  endOffset: number;
  count: number;
}
interface CoverageFunction {
  functionName: string;
  ranges: CoverageRange[];
  isBlockCoverage: boolean;
}
interface JSCoverageEntry {
  url: string;
  scriptId: string;
  source?: string;
  functions: CoverageFunction[];
}

// Compute the fraction of a script (in bytes) that was executed, by merging
// the per-function V8 ranges into a non-overlapping set.
function byteCoverage(entry: JSCoverageEntry, totalLength: number): number {
  const ranges: Array<[number, number]> = [];
  for (const fn of entry.functions) {
    for (const r of fn.ranges) {
      if (r.count > 0) ranges.push([r.startOffset, r.endOffset]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  let covered = 0;
  let curEnd = -1;
  for (const [s, e] of ranges) {
    if (e <= curEnd) continue;
    const start = Math.max(s, curEnd);
    covered += e - start;
    curEnd = e;
  }
  return totalLength === 0 ? 0 : covered / totalLength;
}

// Frontend (browser) coverage is independent of Bun's JSC server limitation:
// the browser is Chromium/V8, so Playwright's V8 coverage works here.
// Note: Playwright's JS coverage API is Chromium-only — skip on Firefox/WebKit.
test.describe('Frontend (browser) JS coverage', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'JS coverage requires Chromium');

  test('measures how much of app.js + inline scripts execute across a full tour', async ({
    page,
  }) => {
    const uniqueId = Date.now();
    const email = `frontend-${uniqueId}@example.com`;
    const password = 'Password123!';

    await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: true });

    // --- Tour: exercise the major client-side code paths ---
    // Landing (loads app.js, header theme script, toast container)
    await page.goto('/');
    await expect(page.locator('header nav strong a')).toContainText('ClickDown');

    // Theme toggle (toggleTheme / updateThemeIcon)
    await page.click('#theme-toggle');

    // Register page — Alpine registerForm validation + the 400-swap path in app.js
    await page.goto('/register');
    await page.fill('#displayName', 'Frontend User');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', 'Mismatch999!');
    // Force-enable submit to bypass Alpine canSubmit and hit the server 400 path
    await page.evaluate(() => {
      document.querySelector('form')?.setAttribute('novalidate', 'true');
      document.querySelector('button[type="submit"]')?.removeAttribute('disabled');
    });
    await page.click('button[type="submit"]'); // -> 400, exercises htmx:beforeOnLoad swap

    // Complete registration
    await page.fill('#confirmPassword', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Create team (opens a modal -> htmx:afterSwap / Alpine.process path in app.js)
    await page.click('text=Create Your First Team');
    await page.fill('#teamName', `Frontend Team ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Team")');

    // Create board
    await page.click('text=Create Board');
    await page.fill('#boardName', `Frontend Board ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Board")');

    // Create a task + open its modal (more swaps)
    const toDoCol = page.locator('.kanban-column').nth(1);
    await toDoCol.locator('footer button').click();
    await page.fill('#taskTitle', `Frontend Task ${uniqueId}`);
    await page.click('button[type="submit"]:has-text("Create Task")');
    await page.locator('.task-card').first().click();
    await page.locator('dialog[open] button:has-text("Close")').click();

    // Profile update -> fires HX-Trigger toast (toastManager / addToast in app.js)
    await page.goto('/profile');
    await page.fill('#displayName', 'Frontend User Updated');
    await page.click('button[type="submit"]:has-text("Save Profile Details")');

    const coverage = (await page.coverage.stopJSCoverage()) as unknown as JSCoverageEntry[];

    // --- Report ---
    const appJsPath = resolve('public/js/app.js');
    const appJsTotal = readFileSync(appJsPath, 'utf8').length;
    const appJsEntries = coverage.filter((e) => e.url.includes('/js/app.js'));
    const appJsEntry = appJsEntries[0];
    const appJsPct = appJsEntry ? Math.round(byteCoverage(appJsEntry, appJsTotal) * 1000) / 10 : 0;

    // Inline scripts: our template code is small (<5KB). Anything bigger is a
    // CDN bundle (Alpine ~300KB, HTMX ~10KB) — exclude those as noise.
    const CDN_THRESHOLD = 5000;
    const ourInline = coverage.filter(
      (e) =>
        !e.url.includes('/js/app.js') &&
        !e.url.includes('alpine') &&
        !e.url.includes('htmx') &&
        (e.source?.length ?? 0) > 0 &&
        (e.source?.length ?? 0) < CDN_THRESHOLD
    );

    const lines = [
      '',
      '══════════════ FRONTEND JS COVERAGE ══════════════',
      `public/js/app.js : ${appJsPct}%  (${appJsEntries.length ? 'instrumented' : 'NOT LOADED'})`,
      `our inline <script> blocks (template code): ${ourInline.length}`,
      ...ourInline
        .filter((e) => (e.source?.length ?? 0) > 100) // skip trivial alpine micro-fns
        .map((e) => {
          const total = e.source?.length ?? 0;
          const pct = total ? Math.round(byteCoverage(e, total) * 1000) / 10 : 0;
          const preview = (e.source ?? '').replace(/\s+/g, ' ').slice(0, 48);
          return `   • ${pct}%  (${total}b)  "${preview}…"`;
        }),
      '════════════════════════════════════════════════',
      '',
    ];
    console.log(lines.join('\n'));

    // Guardrail: app.js is small and mostly used; flag regressions.
    expect(appJsEntries.length, 'app.js should be loaded during the tour').toBeGreaterThan(0);
    expect(appJsPct, 'app.js coverage should stay high').toBeGreaterThanOrEqual(75);
  });
});
