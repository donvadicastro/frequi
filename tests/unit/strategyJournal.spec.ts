import { describe, expect, it } from 'vitest';
import { strategyMessagePost, tradeJournal } from '@/utils/strategyJournal';
import type { Trade } from '@/types';

const trade = (overrides: Partial<Trade> = {}): Trade =>
  ({
    trade_id: 1,
    strategy: 'Momentum',
    pair: 'BTC/USDT',
    is_open: true,
    open_timestamp: 1000,
    open_rate: 100,
    enter_tag: 'volume_confirmed',
    ...overrides,
  }) as Trade;

describe('strategy journal', () => {
  it('does not present unfilled entry orders as executions', () => {
    expect(tradeJournal([trade()])).toEqual([]);
  });
  it('keeps fills distinct, including partial exits and position adjustments', () => {
    const record = trade({
      orders: [
        {
          order_id: 'entry',
          ft_is_entry: true,
          ft_order_side: 'sell',
          filled: 2,
          safe_price: 100,
          order_filled_timestamp: 2000,
        },
        {
          order_id: 'adjust',
          ft_is_entry: true,
          ft_order_side: 'sell',
          filled: 1,
          safe_price: 105,
          order_filled_timestamp: 3000,
        },
        {
          order_id: 'exit',
          ft_is_entry: false,
          ft_order_side: 'buy',
          filled: 1,
          safe_price: 90,
          order_filled_timestamp: 4000,
          ft_order_tag: 'partial_profit',
        },
      ] as Trade['orders'],
      is_short: true,
    });
    const posts = tradeJournal([record, record]);
    expect(posts).toHaveLength(3);
    expect(posts[0]?.title).toContain('SELL');
    expect(posts[2]?.message).toContain('partial_profit');
    expect(posts[2]?.timestamp).toBe(4000);
  });
  it('classifies live API orders without the backtest entry flag', () => {
    const posts = tradeJournal([
      trade({
        open_fill_timestamp: 2000,
        orders: [
          {
            order_id: 'live-buy',
            ft_order_side: 'buy',
            filled: 2,
            safe_price: 100,
            order_filled_timestamp: 2000,
          },
          {
            order_id: 'live-sell',
            ft_order_side: 'sell',
            filled: 1,
            safe_price: 110,
            order_filled_timestamp: 3000,
          },
        ] as Trade['orders'],
      }),
    ]);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.title).toContain('Entry');
    expect(posts[1]?.title).toContain('Exit');
  });
  it('uses actual fill and close times and stored reasons for older records', () => {
    const posts = tradeJournal([
      trade({
        is_open: false,
        open_fill_timestamp: 2000,
        close_timestamp: 4000,
        close_rate: 120,
        exit_reason: 'roi',
      }),
    ]);
    expect(posts.map((post) => post.timestamp)).toEqual([2000, 4000]);
    expect(posts[0]?.message).toContain('volume_confirmed');
    expect(posts[1]?.message).toContain('roi');
  });
  it('preserves structured signal event times and scopes deduplication to strategy', () => {
    const message = JSON.stringify({
      id: 'cross-1',
      timestamp: '2026-10-18T14:05:00Z',
      pair: 'BTC/USDT',
      title: 'RSI crossed 30',
      message: 'Waiting for volume',
    });
    const post = strategyMessagePost(message, 'Momentum', 1234);
    expect(post.timestamp).toBe(Date.parse('2026-10-18T14:05:00Z'));
    expect(post.receivedAt).toBe(1234);
    expect(post.message).toBe('Waiting for volume');
    expect(post.id).not.toBe(strategyMessagePost(message, 'Other', 1234).id);
  });
  it('handles plain text and malformed timestamps without inventing event times', () => {
    expect(strategyMessagePost('Waiting for volume', 'Momentum', 1234).message).toBe(
      'Waiting for volume',
    );
    expect(
      strategyMessagePost('{"timestamp":"bad","message":"Waiting"}', 'Momentum', 1234).timestamp,
    ).toBe(1234);
    expect(strategyMessagePost('null', 'Momentum', 1234).message).toBe('null');
  });
});

describe('execution impact', () => {
  const order = (
    id: string,
    side: string,
    filled: number,
    price: number,
    time: number,
    extras = {},
  ) => ({
    order_id: id,
    ft_order_side: side,
    filled,
    safe_price: price,
    order_filled_timestamp: time,
    ...extras,
  });
  it('replays fills chronologically, accounts for base fees, and distinguishes cash from profit', () => {
    const posts = tradeJournal([
      trade({
        amount: 2.99,
        orders: [
          order('sell', 'sell', 1, 120, 3000),
          order('buy', 'buy', 4, 100, 2000, { ft_fee_base: 0.01, cost: 400 }),
        ] as Trade['orders'],
      }),
    ]);
    expect(posts[0]?.impact).toMatchObject({
      positionBefore: 0,
      positionAfter: 3.99,
      cashFlow: -400,
      baseCurrency: 'BTC',
      quoteCurrency: 'USDT',
    });
    expect(posts[1]?.impact).toMatchObject({
      positionBefore: 3.99,
      positionAfter: 2.99,
      positionNow: 2.99,
      cashFlow: 120,
    });
  });
  it('does not invent historical holdings when fills are missing', () => {
    const posts = tradeJournal([
      trade({ amount: 5, orders: [order('buy', 'buy', 2, 100, 2000)] as Trade['orders'] }),
    ]);
    expect(posts[0]?.impact?.positionAfter).toBeUndefined();
    expect(posts[0]?.impact?.positionNow).toBe(5);
    expect(posts[0]?.impact?.cashFlow).toBe(-200);
    const exitOnly = tradeJournal([
      trade({ orders: [order('sell', 'sell', 1, 100, 2000)] as Trade['orders'] }),
    ]);
    expect(exitOnly[0]?.impact?.positionAfter).toBeUndefined();
  });
  it('represents futures as notional exposure without claiming spot cash movement', () => {
    const posts = tradeJournal([
      trade({
        is_short: true,
        leverage: 3,
        amount: 2,
        orders: [order('short', 'sell', 2, 100, 2000)] as Trade['orders'],
      }),
    ]);
    expect(posts[0]?.impact).toMatchObject({ positionAfter: 2, notional: 200, isShort: true });
    expect(posts[0]?.impact?.cashFlow).toBeUndefined();
  });
  it('replays cash across different pairs in event order, not the input or displayed order', () => {
    const records = [
      trade({
        trade_id: 2,
        pair: 'ETH/USDT',
        amount: 1,
        orders: [order('eth-buy', 'buy', 1, 120, 3000)] as Trade['orders'],
      }),
      trade({
        trade_id: 1,
        amount: 1,
        orders: [
          order('btc-buy', 'buy', 2, 100, 1000),
          order('btc-sell', 'sell', 1, 110, 2000),
        ] as Trade['orders'],
      }),
    ];
    const posts = tradeJournal(records, 1000, 'USDT');
    const eth = posts.find((post) => post.pair === 'ETH/USDT')!;
    expect(eth.impact).toMatchObject({
      cashFlow: -120,
      cashBefore: 910,
      cashAfter: 790,
      coinFlow: 1,
      positionBefore: 0,
      positionAfter: 1,
    });
    const btcSell = posts.find((post) => post.title.startsWith('SELL'))!;
    expect(btcSell.impact).toMatchObject({
      cashFlow: 110,
      cashBefore: 800,
      cashAfter: 910,
      coinFlow: -1,
      positionBefore: 2,
      positionAfter: 1,
    });
    expect(
      tradeJournal([...records, records[0]!], 1000, 'USDT').find((post) => post.pair === 'ETH/USDT')
        ?.impact?.cashAfter,
    ).toBe(790);
  });
  it('leaves cash balances unavailable without starting capital or after missing fills', () => {
    const record = trade({
      amount: 1,
      orders: [order('buy', 'buy', 1, 100, 2000)] as Trade['orders'],
    });
    expect(tradeJournal([record], undefined, 'USDT')[0]?.impact?.cashBefore).toBeUndefined();
    const untimed = trade({
      trade_id: 3,
      orders: [order('untimed', 'buy', 1, 100, 0)] as Trade['orders'],
    });
    expect(tradeJournal([record, untimed], 1000, 'USDT')[0]?.impact?.cashBefore).toBeUndefined();
    const missing = trade({ trade_id: 2, open_fill_timestamp: 1000 });
    expect(
      tradeJournal([record, missing], 1000, 'USDT').find((post) => post.impact)?.impact?.cashBefore,
    ).toBeUndefined();
  });
  it('does not apply a starting balance in another currency or invent negative cash', () => {
    const record = trade({
      amount: 1,
      orders: [order('buy', 'buy', 1, 100, 2000)] as Trade['orders'],
    });
    expect(tradeJournal([record], 1000, 'USD')[0]?.impact?.cashBefore).toBeUndefined();
    expect(tradeJournal([record], 50, 'USDT')[0]?.impact?.cashAfter).toBeUndefined();
  });
});
