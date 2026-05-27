import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@entra-portal.local';
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'EntraPortal!2024';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
  });

  test('should display sidebar navigation', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Entra Portal')).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Tenants' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Agents' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Audit Trail' })).toBeVisible();
  });

  test('should navigate to agents page', async ({ page }) => {
    await page.getByRole('link', { name: 'Agents' }).click();
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  });

  test('should navigate to global audit trail', async ({ page }) => {
    await page.locator('aside').getByRole('link', { name: 'Audit Trail' }).click();
    await expect(page.getByRole('heading', { name: /Audit Trail/ })).toBeVisible();
  });

  test('should display header with user info', async ({ page }) => {
    await expect(page.getByText('System Administrator')).toBeVisible();
    await expect(page.getByText('superadmin')).toBeVisible();
  });
});
