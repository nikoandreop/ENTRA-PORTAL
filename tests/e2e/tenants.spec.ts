import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@entra-portal.local';
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'EntraPortal!2024';

test.describe('Tenant Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to tenants page', async ({ page }) => {
    await page.getByRole('link', { name: 'Tenants' }).click();
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
  });

  test('should show onboard button', async ({ page }) => {
    await page.getByRole('link', { name: 'Tenants' }).click();
    await expect(page.getByRole('link', { name: /Onboard Tenant/ })).toBeVisible();
  });

  test('should navigate to onboarding wizard', async ({ page }) => {
    await page.getByRole('link', { name: 'Tenants' }).click();
    await page.getByRole('link', { name: /Onboard Tenant/ }).click();
    await expect(page.getByRole('heading', { name: 'Onboard Tenant' })).toBeVisible();
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
  });

  test('should validate onboarding form step 1', async ({ page }) => {
    await page.goto('/tenants/onboard');
    await page.getByRole('button', { name: 'Continue' }).click();
    // Form validation should prevent moving forward without required fields
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
  });

  test('should progress through onboarding steps', async ({ page }) => {
    await page.goto('/tenants/onboard');
    await page.getByPlaceholder('Contoso Ltd').fill('Test Tenant');
    await page.getByPlaceholder('contoso.onmicrosoft.com').fill('test.onmicrosoft.com');
    await page.getByPlaceholder('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').first().fill('12345678-1234-1234-1234-123456789012');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Step 2 of 3')).toBeVisible({ timeout: 5000 });
  });
});
