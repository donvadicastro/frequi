import { describe, expect, it } from 'vitest';
import { aggregateWalletHistory } from '@/utils/portfolioHistory';
import type { WalletHistory } from '@/types';
const history = (data: number[][], capture_start_ts?: number): WalletHistory => ({
  columns: ['__date_ts', 'total_quote'],
  data,
  length: data.length,
  capture_start_ts,
});

describe('portfolio wallet history', () => {
  it('aligns asynchronous snapshots without extending beyond shared history', () => {
    const result = aggregateWalletHistory([
      history([
        [100, 10],
        [200, 12],
        [300, 15],
        [400, 20],
      ]),
      history([
        [150, 20],
        [250, 24],
        [350, 25],
      ]),
    ]);
    expect(result?.data).toEqual([
      [150, 30],
      [200, 32],
      [250, 36],
      [300, 39],
      [350, 40],
    ]);
  });
  it('excludes reconstructed data before actual capture starts', () => {
    expect(
      aggregateWalletHistory([
        history(
          [
            [100, 10],
            [200, 15],
            [300, 20],
          ],
          250,
        ),
        history([
          [100, 20],
          [300, 30],
        ]),
      ])?.data,
    ).toEqual([
      [250, 35],
      [300, 50],
    ]);
  });
  it('keeps zero balances and sorts snapshots', () => {
    expect(
      aggregateWalletHistory([
        history([
          [200, 5],
          [100, 0],
        ]),
      ])?.data,
    ).toEqual([
      [100, 0],
      [200, 5],
    ]);
  });
  it('does not fabricate a portfolio for missing or nonoverlapping history', () => {
    expect(aggregateWalletHistory([])).toBeUndefined();
    expect(aggregateWalletHistory([history([])])).toBeUndefined();
    expect(aggregateWalletHistory([history([[100, 10]]), history([[200, 20]])])).toBeUndefined();
    expect(
      aggregateWalletHistory([{ ...history([[100, 10]]), columns: ['invalid', 'total_quote'] }]),
    ).toBeUndefined();
  });
});
