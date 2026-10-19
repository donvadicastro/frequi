import { describe, expect, it } from 'vitest';
import type { PairHistory, Trade } from '@/types';
import { buildAllocationHistory, type AllocationSource } from '@/utils/allocationHistory';

const trade = (
  id: number,
  pair: string,
  price: number,
  time: number,
  overrides: Partial<Trade> = {},
): Trade =>
  ({
    trade_id: id,
    pair,
    is_open: true,
    amount: 1,
    open_timestamp: time,
    open_fill_timestamp: time,
    open_rate: price,
    orders: [
      {
        order_id: `${id}-buy`,
        ft_order_side: 'buy',
        filled: 1,
        safe_price: price,
        cost: price,
        order_filled_timestamp: time,
      },
    ],
    ...overrides,
  }) as Trade;
const candles = (data: number[][]): PairHistory =>
  ({ columns: ['__date_ts', 'close'], timeframe_ms: 1000, data }) as PairHistory;
const source = (): AllocationSource => ({
  id: 'bot1',
  currency: 'USD',
  startingCash: 1000,
  trades: [trade(1, 'BTC/USD', 300, 2000), trade(2, 'ETH/USD', 500, 3000)],
  prices: {
    'BTC/USD': candles([
      [1000, 300],
      [2000, 300],
      [3000, 600],
    ]),
    'ETH/USD': candles([
      [1000, 500],
      [2000, 500],
      [3000, 500],
    ]),
  },
});
function at(result: ReturnType<typeof buildAllocationHistory>, timestamp: number) {
  const point = result.points.find((point) => point.timestamp === timestamp);
  if (!point || 'gap' in point) throw new Error(`No allocation at ${timestamp}`);
  return point;
}

describe('holdings allocation history', () => {
  it('shows a fixed 100% portfolio split by common-currency value, not coin quantity', () => {
    const result = buildAllocationHistory([source()], 4000);
    expect(at(result, 3000).percentages).toEqual({ USD: 20, BTC: 30, ETH: 50 });
    expect(at(result, 1999).percentages).toEqual({ USD: 100 });
    for (const point of result.points) {
      if ('gap' in point) continue;
      expect(Object.values(point.percentages).reduce((sum, value) => sum + value, 0)).toBeCloseTo(
        100,
        10,
      );
    }
  });
  it('changes weights with market prices without needing another trade', () => {
    const result = buildAllocationHistory([source()], 4000);
    expect(at(result, 4000).values).toEqual({ USD: 200, BTC: 600, ETH: 500 });
    expect(at(result, 4000).percentages.BTC).toBeCloseTo((600 / 1300) * 100);
    // A close labelled 3000 is not yet available at time 3000.
    expect(at(result, 3000).values.BTC).toBe(300);
  });
  it('combines strategies by asset value instead of averaging their percentages', () => {
    const result = buildAllocationHistory(
      [source(), { id: 'cash-bot', currency: 'USD', startingCash: 1000, trades: [], prices: {} }],
      4000,
    );
    expect(at(result, 3000).percentages).toEqual({ USD: 60, BTC: 15, ETH: 25 });
  });
  it('returns sale proceeds to the cash layer and reduces the coin layer', () => {
    const input = source();
    input.trades[0]!.amount = 0.5;
    input.trades[0]!.orders!.push({
      order_id: 'partial-sell',
      ft_order_side: 'sell',
      filled: 0.5,
      safe_price: 600,
      cost: 300,
      order_filled_timestamp: 4000,
    } as NonNullable<Trade['orders']>[number]);
    const result = buildAllocationHistory([input], 4000);
    expect(at(result, 4000).values).toEqual({ USD: 500, BTC: 300, ETH: 500 });
  });
  it('does not replace missing or stale prices with zero or future candle prices', () => {
    const input = source();
    input.prices['ETH/USD'] = candles([
      [1000, 500],
      [9000, 1],
    ]);
    input.prices['BTC/USD'] = candles([
      [1000, 300],
      [2000, 300],
      [3000, 600],
      [4000, 600],
      [5000, 600],
      [6000, 600],
    ]);
    input.prices['ETH/USD']!.data.push([6000, 500]);
    const result = buildAllocationHistory([input], 7000);
    expect(result.points.find((point) => point.timestamp === 6000)).toEqual({
      timestamp: 6000,
      gap: true,
    });
    expect(result.warning).toContain('missing historical prices');
  });
  it('rejects mixed currencies, unsupported margin positions, and incomplete fills', () => {
    expect(buildAllocationHistory([source(), { ...source(), currency: 'USDT' }]).points).toEqual(
      [],
    );
    const short = source();
    short.trades[0]!.is_short = true;
    expect(buildAllocationHistory([short]).warning).toContain('spot');
    const missing = source();
    missing.trades[0]!.orders = [];
    expect(buildAllocationHistory([missing]).warning).toContain('Complete spot fill history');
  });
  it('deduplicates fills supplied in both open and trade history responses', () => {
    const input = source();
    input.trades.push(input.trades[0]!);
    expect(at(buildAllocationHistory([input], 4000), 3000).values).toEqual({
      USD: 200,
      BTC: 300,
      ETH: 500,
    });
  });
});
