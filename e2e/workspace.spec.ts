import { test, expect } from '@playwright/test';
import { defaultMocks, setLoginInfo } from './helpers';

test('Workspace notes stay in their strategy space and survive reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await defaultMocks(page);
  await setLoginInfo(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'agent-commons', exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message agent-commons' }).fill('Portfolio review');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Portfolio review', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /TestBot/ }).click();
  await expect(
    page.getByRole('navigation', { name: 'Agent views' }).getByRole('button', { name: 'Charts' }),
  ).toBeVisible();
  await expect(page.getByText('Portfolio review', { exact: true })).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Message TestBot' }).fill('Review strategy risk');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'agent-commons' }).click();
  await page.reload();
  await expect(page.getByText('Portfolio review', { exact: true })).toBeVisible();
  await expect(page.getByText('Review strategy risk', { exact: true })).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('Empty workspace offers a real account connection', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A meeting place for your strategies.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Connect your first strategy' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('Strategy agents are empty until a bot is registered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.agent-button')).toHaveCount(0);
  await expect(
    page.getByText('Connect a bot to give your first strategy its own space.'),
  ).toBeVisible();
});

test('Returning from a dark dashboard keeps workspace orders light', async ({ page }) => {
  await defaultMocks(page);
  await setLoginInfo(page);
  await page.evaluate(() => {
    localStorage.setItem('ftUISettings', JSON.stringify({ currentTheme: 'dark' }));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.goto('/');
  await page.getByRole('button', { name: /TestBot/ }).click();
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.getByRole('heading', { name: /Open trades/ })).toBeVisible();
});
