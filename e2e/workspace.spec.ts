import { test, expect } from '@playwright/test';
import { defaultMocks, setLoginInfo, tradeMocks } from './helpers';
import configFixture from './testData/show_config.json' with { type: 'json' };
import balanceFixture from './testData/balance.json' with { type: 'json' };
import profitFixture from './testData/profit.json' with { type: 'json' };

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
  await expect(page.getByRole('region', { name: 'Live summary', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dry-run summary', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
  await expect(page.getByText('No live strategies connected.')).toBeVisible();
  await page.getByRole('tab', { name: /Dry-run/ }).click();
  await expect(page.getByText('No dry-run strategies connected.')).toBeVisible();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
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

test('Sidebar separates live and dry-run strategies and remembers collapsed groups', async ({
  page,
}) => {
  await defaultMocks(page);
  await page.route('**/api/v1/show_config', (route) => {
    if (route.request().url().includes('/unknown/')) return route.fulfill({ json: {} });
    const live = route.request().url().includes('/live/');
    return route.fulfill({
      json: { ...configFixture, dry_run: !live, runmode: live ? 'live' : 'dry_run' },
    });
  });
  await setLoginInfo(page);
  await page.evaluate(() => {
    const info = JSON.parse(localStorage.getItem('ftAuthLoginInfo')!);
    info['ftbot.1'] = {
      ...info['ftbot.0'],
      botName: 'LiveBot',
      apiUrl: 'http://localhost:8080/live',
    };
    info['ftbot.2'] = {
      ...info['ftbot.0'],
      botName: 'UnknownBot',
      apiUrl: 'http://localhost:8080/unknown',
    };
    localStorage.setItem('ftAuthLoginInfo', JSON.stringify(info));
  });
  await page.reload();
  const live = page.locator('details[data-mode="live"]');
  const dryRun = page.locator('details[data-mode="dry_run"]');
  await expect(live.getByRole('button', { name: /LiveBot/ })).toBeVisible();
  await expect(dryRun.getByRole('button', { name: /TestBot/ })).toBeVisible();
  await expect(live.getByRole('button', { name: /TestBot/ })).toHaveCount(0);
  await expect(dryRun.getByRole('button', { name: /LiveBot/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /UnknownBot Mode unavailable/ })).toBeVisible();
  await expect(live.getByRole('button', { name: /UnknownBot/ })).toHaveCount(0);
  await expect(dryRun.getByRole('button', { name: /UnknownBot/ })).toHaveCount(0);
  await live.locator('summary').click();
  await expect(live.getByRole('button', { name: /LiveBot/ })).not.toBeVisible();
  await expect(dryRun.getByRole('button', { name: /TestBot/ })).toBeVisible();
  await page.reload();
  await expect(dryRun.getByRole('button', { name: /TestBot/ })).toBeVisible();
  await expect(live).toHaveJSProperty('open', false);
  await page.getByRole('textbox', { name: 'Find an agent' }).fill('LiveBot');
  await expect(live.getByRole('button', { name: /LiveBot/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Find an agent' }).clear();
  await expect(live).toHaveJSProperty('open', false);
  await live.locator('summary').click();
  await expect(live.getByRole('button', { name: /LiveBot/ })).toBeVisible();
});

test('Commons keeps live and dry-run summaries, wallet history, holdings and activity separate', async ({
  page,
}) => {
  await defaultMocks(page);
  await tradeMocks(page);
  const firstFill = Date.UTC(2026, 9, 9);
  const modeValue = (url: string) =>
    url.includes('/unknown/') ? 9000 : url.includes('/live/') ? 1000 : 2000;
  await page.route('**/api/v1/show_config', (route) => {
    if (route.request().url().includes('/unknown/')) return route.fulfill({ json: {} });
    const live = route.request().url().includes('/live/');
    return route.fulfill({
      json: { ...configFixture, dry_run: !live, runmode: live ? 'live' : 'dry_run' },
    });
  });
  await page.route('**/api/v1/balance', (route) => {
    const total = modeValue(route.request().url());
    return route.fulfill({
      json: { ...balanceFixture, total, total_bot: total, starting_capital: total },
    });
  });
  await page.route('**/api/v1/profit', (route) =>
    route.fulfill({
      json: {
        ...profitFixture,
        profit_all_coin: modeValue(route.request().url()) / 10,
      },
    }),
  );
  await page.route('**/api/v1/profit_all', (route) =>
    route.fulfill({
      json: {
        all: { ...profitFixture, profit_all_coin: modeValue(route.request().url()) / 10 },
      },
    }),
  );
  await page.route('**/api/v1/historic_balance', (route) => {
    const total = modeValue(route.request().url());
    return route.fulfill({
      json: {
        columns: ['__date_ts', 'total_quote'],
        data: [
          [firstFill, total - 100],
          [firstFill + 3600000, total],
        ],
        length: 2,
      },
    });
  });
  await page.route('**/api/v1/trades*', (route) => {
    const asset = route.request().url().includes('/live/') ? 'BTC' : 'ETH';
    return route.fulfill({
      json: {
        total_trades: 1,
        trades: [
          {
            trade_id: 1,
            strategy: 'SampleStrategy',
            pair: `${asset}/USDT`,
            is_open: true,
            amount: 1,
            open_rate: 300,
            open_timestamp: firstFill,
            open_fill_timestamp: firstFill,
            orders: [
              {
                order_id: 'entry',
                ft_order_side: 'buy',
                ft_is_entry: true,
                filled: 1,
                safe_price: 300,
                cost: 300,
                order_filled_timestamp: firstFill,
              },
            ],
          },
        ],
      },
    });
  });
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
        data: [
          [firstFill - 3600000, 300],
          [firstFill, 300],
          [firstFill + 3600000, 300],
        ],
      },
    });
  });
  await setLoginInfo(page);
  await page.evaluate(() => {
    const info = JSON.parse(localStorage.getItem('ftAuthLoginInfo')!);
    info['ftbot.1'] = {
      ...info['ftbot.0'],
      botName: 'LiveBot',
      apiUrl: 'http://localhost:8080/live',
    };
    info['ftbot.2'] = {
      ...info['ftbot.0'],
      botName: 'UnknownBot',
      apiUrl: 'http://localhost:8080/unknown',
    };
    localStorage.setItem('ftAuthLoginInfo', JSON.stringify(info));
  });
  await page.reload();
  const live = page.getByRole('region', { name: 'Live summary', exact: true });
  const dryRun = page.getByRole('region', { name: 'Dry-run summary', exact: true });
  await expect(live.getByRole('article').nth(0)).toContainText('1');
  await expect(dryRun.getByRole('article').nth(0)).toContainText('1');
  await expect(live.getByRole('article').nth(2)).toContainText('1,000 USDT');
  await expect(dryRun.getByRole('article').nth(2)).toContainText('2,000 USDT');
  await expect(live.getByRole('article').nth(3)).toContainText('100 USDT');
  await expect(dryRun.getByRole('article').nth(3)).toContainText('200 USDT');
  await expect(page.getByText(/1 strategy with unavailable trading mode/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Find an agent' }).fill('LiveBot');
  await expect(dryRun.getByRole('article').nth(2)).toContainText('2,000 USDT');
  await page.getByRole('textbox', { name: 'Find an agent' }).clear();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
  const panel = page.getByRole('tabpanel');
  const activity = panel.getByRole('region', { name: 'Strategy activity' });
  const allocation = panel.getByRole('list', { name: 'Latest allocation percentages' });
  await expect(page.getByRole('tab', { name: /Live/ })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('heading', { name: 'Live portfolio', exact: true })).toBeVisible();
  await expect(panel.locator('.history-stats dd').nth(1)).toContainText('1,000 USDT');
  await expect(activity).toContainText('LiveBot');
  await expect(activity).not.toContainText('TestBot');
  await expect(activity).not.toContainText('UnknownBot');
  await expect(allocation).toContainText('BTC: 30.00%');
  await expect(allocation).not.toContainText('ETH');
  await page.getByRole('tab', { name: /Dry-run/ }).click();
  await expect(
    panel.getByRole('heading', { name: 'Dry-run portfolio', exact: true }),
  ).toBeVisible();
  await expect(panel.locator('.history-stats dd').nth(1)).toContainText('2,000 USDT');
  await expect(activity).toContainText('TestBot');
  await expect(activity).not.toContainText('LiveBot');
  await expect(activity).not.toContainText('UnknownBot');
  await expect(allocation).toContainText('ETH: 15.00%');
  await expect(allocation).not.toContainText('BTC');
  await page.getByRole('tab', { name: /Dry-run/ }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: /Live/ })).toBeFocused();
  await expect(panel.getByRole('heading', { name: 'Live portfolio', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Live/ }).press('End');
  await expect(page.getByRole('tab', { name: /Dry-run/ })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Dry-run/ })).toHaveAttribute('aria-selected', 'true');
  await expect(
    panel.getByRole('heading', { name: 'Dry-run portfolio', exact: true }),
  ).toBeVisible();
});
