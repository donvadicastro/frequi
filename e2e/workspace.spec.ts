import { test, expect } from '@playwright/test';
import { defaultMocks, setLoginInfo, tradeMocks } from './helpers';

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

test('Portfolio activity sits below balances and loads ten older events at a time', async ({
  page,
}) => {
  await defaultMocks(page);
  await tradeMocks(page);
  const firstFill = Date.UTC(2026, 9, 9, 1);
  await page.route('**/api/v1/trades*', (route) =>
    route.fulfill({
      json: {
        total_trades: 1,
        trades: [
          {
            trade_id: 1,
            strategy: 'SampleStrategy',
            pair: 'BTC/USDT',
            is_open: true,
            amount: 12,
            open_rate: 10,
            open_timestamp: firstFill,
            open_fill_timestamp: firstFill,
            orders: Array.from({ length: 12 }, (_, index) => ({
              order_id: `fill-${index}`,
              ft_order_side: 'buy',
              ft_is_entry: true,
              filled: 1,
              safe_price: 10,
              cost: 10,
              order_filled_timestamp: firstFill + index * 1000,
            })),
          },
        ],
      },
    }),
  );
  await setLoginInfo(page);
  await page.reload();
  await page.getByRole('button', { name: /TestBot/ }).click();
  const activity = page.getByRole('region', { name: 'Strategy activity' });
  await expect(activity).not.toBeVisible();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
  await expect(page.getByText('Bot Balance', { exact: true })).toBeVisible();
  await expect(activity.getByRole('article')).toHaveCount(10);
  await expect(activity.locator('time').first()).toHaveAttribute(
    'datetime',
    new Date(firstFill + 11000).toISOString(),
  );
  await expect(activity.locator('details')).toHaveCount(0);
  const balance = page.locator('.current-holdings');
  expect(
    await balance.evaluate((element) =>
      Boolean(
        element.compareDocumentPosition(
          document.querySelector('[aria-label="Strategy activity"]')!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  await activity.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(activity.getByRole('article')).toHaveCount(12);
  await expect(activity.getByRole('button', { name: 'Load more', exact: true })).not.toBeVisible();
});

test('Portfolio holdings chart stacks cash and assets to one hundred percent', async ({ page }) => {
  await defaultMocks(page);
  await tradeMocks(page);
  const firstFill = Date.UTC(2026, 9, 9);
  await page.route('**/api/v1/trades*', (route) =>
    route.fulfill({
      json: {
        total_trades: 2,
        trades: ['BTC', 'ETH'].map((asset, index) => ({
          trade_id: index + 1,
          strategy: 'SampleStrategy',
          pair: `${asset}/USDT`,
          is_open: true,
          amount: 1,
          open_rate: index ? 500 : 300,
          open_timestamp: firstFill,
          open_fill_timestamp: firstFill,
          orders: [
            {
              order_id: `${asset}-buy`,
              ft_order_side: 'buy',
              ft_is_entry: true,
              filled: 1,
              safe_price: index ? 500 : 300,
              cost: index ? 500 : 300,
              order_filled_timestamp: firstFill,
            },
          ],
        })),
      },
    }),
  );
  await page.route(/\/api\/v1\/pair_(?:history|candles)(?:\?|$)/, (route) => {
    const payload =
      route.request().method() === 'POST'
        ? route.request().postDataJSON()
        : Object.fromEntries(new URL(route.request().url()).searchParams);
    return route.fulfill({
      json: {
        pair: payload.pair,
        columns: ['__date_ts', 'close'],
        timeframe_ms: 3600000,
        data: Array.from({ length: 73 }, (_, index) => [
          firstFill + (index - 1) * 3600000,
          payload.pair.startsWith('BTC') ? (index > 24 && index < 49 ? 500 : 300) : 500,
        ]),
      },
    });
  });
  await setLoginInfo(page);
  await page.reload();
  await page.getByRole('button', { name: /TestBot/ }).click();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
  const chart = page.getByRole('region', { name: 'Holdings allocation over time' });
  await expect(chart.getByRole('heading', { name: 'Holdings over time' })).toBeVisible();
  await expect(chart.locator('canvas')).toHaveCount(1);
  const allocation = chart.getByRole('list', { name: 'Latest allocation percentages' });
  await expect(allocation).toContainText('USDT (cash): 20.00%');
  await expect(allocation).toContainText('BTC: 30.00%');
  await expect(allocation).toContainText('ETH: 50.00%');
  await expect(chart.getByText(/Each point totals 100%/)).toBeVisible();
});
