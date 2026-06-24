import { expect, test } from '@playwright/test';

test.describe('ClickDown E2E Authentication and Onboarding Flow', () => {
  const uniqueEmail = `auth-user-${Date.now()}@example.com`;
  const correctPassword = 'SecurePassword123!';
  const displayName = 'Alex Authenticator';

  test.beforeEach(async ({ page }) => {
    // Visit landing page
    await page.goto('/');
  });

  test('should display validation error for mismatched passwords during registration', async ({
    page,
  }) => {
    await page.click('text=Register');
    await expect(page).toHaveURL('/register');

    // Force-enable submit button in test to bypass client-side match checks and test server-side validation
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form?.setAttribute('novalidate', 'true');
      const btn = form?.querySelector('button[type="submit"]');
      btn?.removeAttribute('disabled');
      btn?.removeAttribute(':disabled');
    });

    await page.fill('#displayName', displayName);
    await page.fill('#email', `test-mismatch-${Date.now()}@example.com`);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Different123!');

    // Force-enable again after input events trigger Alpine updates
    await page.evaluate(() => {
      const btn = document.querySelector('form button[type="submit"]');
      btn?.removeAttribute('disabled');
    });

    await page.click('button[type="submit"]');

    // Assert the form error is swapped and visible
    const formErrors = page.locator('#form-errors');
    await expect(formErrors).toBeVisible();
    await expect(formErrors).toContainText('Passwords do not match');
  });

  test('should display validation error for weak passwords during registration', async ({
    page,
  }) => {
    await page.click('text=Register');
    await expect(page).toHaveURL('/register');

    // Disable browser native HTML5 validation and force-enable submit button to test server-side fallback validation
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form?.setAttribute('novalidate', 'true');
      const btn = form?.querySelector('button[type="submit"]');
      btn?.removeAttribute('disabled');
      btn?.removeAttribute(':disabled');
    });

    await page.fill('#displayName', displayName);
    await page.fill('#email', `test-weak-${Date.now()}@example.com`);

    // Test case 1: short password
    await page.fill('#password', 'Pass1!');
    await page.fill('#confirmPassword', 'Pass1!');

    await page.evaluate(() => {
      const btn = document.querySelector('form button[type="submit"]');
      btn?.removeAttribute('disabled');
    });
    await page.click('button[type="submit"]');

    const formErrors = page.locator('#form-errors');
    await expect(formErrors).toBeVisible();
    await expect(formErrors).toContainText('Password must be at least 8 characters long');

    // Test case 2: no numbers
    await page.fill('#password', 'PasswordNoNumber!');
    await page.fill('#confirmPassword', 'PasswordNoNumber!');

    await page.evaluate(() => {
      const btn = document.querySelector('form button[type="submit"]');
      btn?.removeAttribute('disabled');
    });
    await page.click('button[type="submit"]');
    await expect(formErrors).toContainText('Password must contain at least one number');

    // Test case 3: no uppercase
    await page.fill('#password', 'passwordlowercase1!');
    await page.fill('#confirmPassword', 'passwordlowercase1!');

    await page.evaluate(() => {
      const btn = document.querySelector('form button[type="submit"]');
      btn?.removeAttribute('disabled');
    });
    await page.click('button[type="submit"]');
    await expect(formErrors).toContainText('Password must contain at least one uppercase letter');
  });

  test('should support registering a new user, logging out, and logging back in successfully', async ({
    page,
  }) => {
    // 1. Register a new user with valid credentials
    await page.click('text=Register');
    await expect(page).toHaveURL('/register');

    await page.fill('#displayName', displayName);
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', correctPassword);
    await page.fill('#confirmPassword', correctPassword);

    // Ensure the submit button is naturally enabled
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).not.toBeDisabled();
    await submitBtn.click();

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.sidebar strong')).toContainText(displayName);

    // 2. Open details dropdown and click Logout
    await page.click('.user-dropdown-trigger');
    await page.click('text=Logout');
    await expect(page).toHaveURL('/');

    // 3. Click Login in the header to go to Login Page
    await page.click('text=Login');
    await expect(page).toHaveURL('/login');

    // 4. Attempt login with invalid password
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Assert the form error is swapped and visible on login page
    const formErrors = page.locator('#form-errors');
    await expect(formErrors).toBeVisible();
    await expect(formErrors).toContainText('Invalid email or password');

    // 5. Login with correct password
    await page.fill('#password', correctPassword);
    await page.click('button[type="submit"]');

    // Should redirect back to dashboard successfully
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.sidebar strong')).toContainText(displayName);
  });
});
