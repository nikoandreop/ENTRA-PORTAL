import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@entra-portal.local';
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'EntraPortal!2024';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
  });

  test('should display dashboard overview with stats', async ({ page }) => {
    await expect(page.getByText('Tenants')).toBeVisible();
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('Open Alerts')).toBeVisible();
    await expect(page.getByText('Agents Online')).toBeVisible();
  });

  test('should display compliance overview', async ({ page }) => {
    await expect(page.getByText('Compliance Overview')).toBeVisible();
  });

  test('should display recent alerts section', async ({ page }) => {
    await expect(page.getByText('Recent Alerts')).toBeVisible();
  });
});
