import type { PairHistory, Trade } from '@/types';
import { tradeJournal, type StrategyPost } from './strategyJournal';

export interface AllocationSource {
  id: string;
  currency: string;
  startingCash: number;
  trades: Trade[];
  prices: Record<string, PairHistory>;
}
export interface AllocationPoint {
  timestamp: number;
  values: Record<string, number>;
  percentages: Record<string, number>;
  total: number;
}
export interface AllocationHistory {
  currency: string;
  assets: string[];
  points: (AllocationPoint | { timestamp: number; gap: true })[];
  warning?: string;
}

/** Replay spot fills, then mark holdings using only prices already known at each time. */
export function buildAllocationHistory(
  sources: AllocationSource[],
  now = Date.now(),
): AllocationHistory {
  const currency = sources[0]?.currency ?? '';
  const empty = (warning: string): AllocationHistory => ({
    currency,
    assets: [],
    points: [],
    warning,
  });
  if (!sources.length) return empty('Connect a strategy to see its holdings history.');
  if (sources.some((source) => source.currency !== currency))
    return empty('Use one quote currency per allocation chart.');
  const ledgers: {
    posts: StrategyPost[];
    prices: Record<string, { time: number; price: number }[]>;
    intervals: Record<string, number>;
    cash: number;
    quantities: Record<string, number>;
    cursor: number;
  }[] = [];
  const timestamps = new Set<number>();
  const assets = new Set<string>([currency]);
  let start = 0;
  let end = now;
  for (const source of sources) {
    if (!Number.isFinite(source.startingCash) || source.startingCash < 0)
      return empty('Starting cash is unavailable.');
    if (
      source.trades.some(
        (trade) =>
          trade.is_short ||
          (trade.leverage ?? 1) > 1 ||
          (trade.trading_mode && trade.trading_mode !== 'spot'),
      )
    ) {
      return empty('Holdings allocation history currently supports spot portfolios.');
    }
    const posts = tradeJournal(source.trades, source.startingCash, currency)
      .filter((post) => post.timestamp <= now)
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    if (
      posts.some(
        (post) =>
          !post.impact ||
          post.impact.cashAfter === undefined ||
          post.impact.positionAfter === undefined,
      )
    ) {
      return empty('Complete spot fill history is needed to reconstruct holdings.');
    }
    const prices: Record<string, { time: number; price: number }[]> = {};
    const intervals: Record<string, number> = {};
    for (const [pair, history] of Object.entries(source.prices)) {
      const date = history.columns?.indexOf('__date_ts') ?? -1;
      const close = history.columns?.indexOf('close') ?? -1;
      if (date < 0 || close < 0 || !history.timeframe_ms) continue;
      intervals[pair] = history.timeframe_ms;
      // Candle timestamps are opening times. Close becomes known at the end of the candle.
      prices[pair] = history.data
        .map((row) => ({
          time: Number(row[date]) + history.timeframe_ms,
          price: Number(row[close]),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.time) &&
            point.time <= now &&
            Number.isFinite(point.price) &&
            point.price > 0,
        );
    }
    const held: Record<string, number> = {};
    const checkedPairs = new Set<string>();
    for (const post of posts) {
      const impact = post.impact!;
      if (impact.quoteCurrency !== currency || impact.baseCurrency === currency)
        return empty('Every holding must be valued in the portfolio quote currency.');
      assets.add(impact.baseCurrency);
      held[post.pair] = (held[post.pair] ?? 0) + impact.coinFlow;
      if (!prices[post.pair]?.length)
        return empty(
          `Historical prices are unavailable for ${post.pair}. Refresh after loading candle history in the bot.`,
        );
      const points = prices[post.pair]!;
      if (!checkedPairs.has(post.pair)) {
        const firstPrice = Math.min(...points.map((point) => point.time));
        const lastPrice = Math.max(...points.map((point) => point.time));
        if (lastPrice < post.timestamp - (intervals[post.pair] ?? 0) * 2)
          return empty(`Historical prices do not cover the fills for ${post.pair}.`);
        if (firstPrice > post.timestamp) start = Math.max(start, firstPrice);
        checkedPairs.add(post.pair);
      }
      points.push({ time: post.timestamp, price: impact.fillPrice });
      timestamps.add(post.timestamp);
    }
    for (const [pair, points] of Object.entries(prices)) {
      points.sort((a, b) => a.time - b.time);
      for (const point of points) timestamps.add(point.time);
      if ((held[pair] ?? 0) > 1e-8) end = Math.min(end, points.at(-1)?.time ?? 0);
    }
    if (posts.length) start = Math.max(start, posts[0]!.timestamp - 1);
    ledgers.push({
      posts,
      prices,
      intervals,
      cash: source.startingCash,
      quantities: {} as Record<string, number>,
      cursor: 0,
    });
  }
  if (!timestamps.size) return empty('No recorded fills are available yet.');
  if (end <= start) return empty('Historical prices are needed to value these holdings.');
  timestamps.add(start);
  timestamps.add(end);
  const candidates = [...timestamps]
    .filter((time) => time >= start && time <= end)
    .sort((a, b) => a - b);
  // Bound rendering cost for long histories, retaining endpoints. Fills still replay in full.
  const stride = Math.max(1, Math.ceil(candidates.length / 2000));
  const samples = candidates.filter(
    (_, index) => index % stride === 0 || index === candidates.length - 1,
  );
  const points: AllocationHistory['points'] = [];
  let gaps = false;
  for (const timestamp of samples) {
    const values: Record<string, number> = Object.fromEntries(
      [...assets].map((asset) => [asset, 0]),
    );
    let valid = true;
    for (const ledger of ledgers) {
      while (
        ledger.cursor < ledger.posts.length &&
        ledger.posts[ledger.cursor]!.timestamp <= timestamp
      ) {
        const post = ledger.posts[ledger.cursor++]!;
        ledger.cash += post.impact!.cashFlow!;
        ledger.quantities[post.pair] = (ledger.quantities[post.pair] ?? 0) + post.impact!.coinFlow;
      }
      values[currency] = (values[currency] ?? 0) + Math.max(0, ledger.cash);
      for (const [pair, quantity] of Object.entries(ledger.quantities)) {
        if (quantity <= 1e-8) continue;
        const series = ledger.prices[pair] ?? [];
        let lo = 0;
        let hi = series.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (series[mid]!.time <= timestamp) lo = mid + 1;
          else hi = mid;
        }
        const price = series[lo - 1];
        if (!price || timestamp - price.time > (ledger.intervals[pair] ?? 0) * 2) {
          valid = false;
          break;
        }
        const base = pair.split('/')[0]!;
        values[base] = (values[base] ?? 0) + quantity * price.price;
      }
    }
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    if (!valid || total <= 0) {
      points.push({ timestamp, gap: true });
      gaps = true;
      continue;
    }
    const percentages: Record<string, number> = {};
    let allocated = 0;
    const positive = Object.keys(values).filter((asset) => values[asset]! > 0);
    positive.forEach((asset, index) => {
      const percent =
        index === positive.length - 1 ? 100 - allocated : (values[asset]! / total) * 100;
      percentages[asset] = percent;
      allocated += percent;
    });
    points.push({ timestamp, values, percentages, total });
  }
  return {
    currency,
    assets: [currency, ...[...assets].filter((asset) => asset !== currency).sort()],
    points,
    warning: gaps
      ? 'Gaps indicate missing historical prices. No future prices are used.'
      : undefined,
  };
}
