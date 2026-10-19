import type { Trade, Order } from '@/types';

export interface ExecutionImpact {
  baseCurrency: string;
  quoteCurrency: string;
  positionBefore?: number;
  positionAfter?: number;
  positionNow?: number;
  coinFlow: number;
  cashBefore?: number;
  cashAfter?: number;
  notional: number;
  fillPrice: number;
  /** Gross spot cash flow; excludes fees. Futures margin is not notional. */
  cashFlow?: number;
  isShort: boolean;
}

export interface StrategyPost {
  id: string;
  strategy: string;
  pair: string;
  timestamp: number;
  kind: 'execution' | 'signal' | 'cancellation';
  title: string;
  message: string;
  tradeId?: number;
  source: 'trade history' | 'strategy message' | 'live event';
  receivedAt?: number;
  impact?: ExecutionImpact;
}

/** Only completed fills are described as executions; pending orders are not trades. */
export function tradeJournal(
  trades: Trade[],
  startingCash?: number,
  stakeCurrency?: string,
): StrategyPost[] {
  const posts = new Map<string, StrategyPost>();
  for (const trade of trades) {
    const base = {
      strategy: trade.strategy || 'Unknown strategy',
      pair: trade.pair,
      tradeId: trade.trade_id,
      kind: 'execution' as const,
      source: 'trade history' as const,
    };
    const filledOrders =
      trade.orders?.filter((order) => order.order_filled_timestamp && (order.filled ?? 0) > 0) ??
      [];
    filledOrders.sort(
      (a, b) =>
        a.order_filled_timestamp! - b.order_filled_timestamp! ||
        (a.order_timestamp ?? 0) - (b.order_timestamp ?? 0),
    );
    // Live API versions may omit the backtest-only ft_is_entry flag.
    const isEntry = (order: Order) =>
      typeof order.ft_is_entry === 'boolean'
        ? order.ft_is_entry
        : order.ft_order_side === (trade.is_short ? 'sell' : 'buy');
    let position: number | undefined = filledOrders[0] && isEntry(filledOrders[0]) ? 0 : undefined;
    if (trade.orders?.some((order) => (order.filled ?? 0) > 0 && !order.order_filled_timestamp))
      position = undefined;
    const impacts: ExecutionImpact[] = [];
    for (const order of filledOrders) {
      const filled = order.filled!;
      const before = position;
      if (position !== undefined) {
        position += isEntry(order) ? filled - (order.ft_fee_base ?? 0) : -filled;
        if (position < -1e-8) position = undefined;
        else position = Math.max(0, position);
      }
      const notional =
        Number.isFinite(order.cost) && order.cost > 0 ? order.cost : filled * order.safe_price;
      const impact: ExecutionImpact = {
        baseCurrency: trade.base_currency || trade.pair.split('/')[0] || '',
        quoteCurrency: trade.quote_currency || trade.pair.split('/')[1]?.split(':')[0] || '',
        positionBefore: position === undefined ? undefined : before,
        positionAfter: position,
        positionNow: !trade.is_open ? 0 : Number.isFinite(trade.amount) ? trade.amount : undefined,
        notional,
        fillPrice: order.safe_price,
        cashFlow:
          (trade.trading_mode && trade.trading_mode !== 'spot') ||
          trade.is_short ||
          (trade.leverage ?? 1) > 1
            ? undefined
            : order.ft_order_side === 'buy'
              ? -notional
              : notional,
        isShort: trade.is_short ?? false,
        coinFlow: isEntry(order) ? filled - (order.ft_fee_base ?? 0) : -filled,
      };
      impacts.push(impact);
      const id = `trade:${trade.trade_id}:order:${order.order_id}`;
      posts.set(id, {
        ...base,
        id,
        timestamp: order.order_filled_timestamp!,
        impact,
        title: `${order.ft_order_side.toUpperCase()} filled · ${isEntry(order) ? 'Entry' : 'Exit'}${trade.is_short ? ' · Short' : ''}`,
        message: `${order.filled} at ${order.safe_price}. Reason: ${order.ft_order_tag || (isEntry(order) ? trade.enter_tag : trade.exit_reason) || 'Not recorded by strategy'}.`,
      });
    }
    const expectedPosition = trade.is_open ? trade.amount : 0;
    if (
      position !== undefined &&
      Number.isFinite(expectedPosition) &&
      Math.abs(position - expectedPosition) > Math.max(1e-8, Math.abs(expectedPosition) * 1e-6)
    ) {
      // An incomplete fill list cannot establish a historical holding accurately.
      for (const impact of impacts) {
        impact.positionBefore = undefined;
        impact.positionAfter = undefined;
      }
    }
    // Older API responses may omit order details. Use fill timestamps, never order creation time.
    if (!filledOrders.some(isEntry) && trade.open_fill_timestamp) {
      const id = `trade:${trade.trade_id}:entry`;
      posts.set(id, {
        ...base,
        id,
        timestamp: trade.open_fill_timestamp,
        title: `${trade.is_short ? 'SELL' : 'BUY'} filled · Entry`,
        message: `Entry at ${trade.open_rate}. Reason: ${trade.enter_tag || 'Not recorded by strategy'}.`,
      });
    }
    if (!trade.is_open && trade.close_timestamp && !filledOrders.some((order) => !isEntry(order))) {
      const id = `trade:${trade.trade_id}:exit`;
      posts.set(id, {
        ...base,
        id,
        timestamp: trade.close_timestamp,
        title: `${trade.is_short ? 'BUY' : 'SELL'} filled · Exit`,
        message: `Exit at ${trade.close_rate ?? 'unknown price'}. Reason: ${trade.exit_reason || 'Not recorded by strategy'}.`,
      });
    }
  }
  const result = [...posts.values()];
  // Cash is shared across pairs: replay the entire bot ledger before filtering or
  // reversing the display. This is a gross reconstruction, not a wallet snapshot.
  let cash = startingCash !== undefined && Number.isFinite(startingCash) ? startingCash : undefined;
  if (
    trades.some((trade) =>
      trade.orders?.some((order) => (order.filled ?? 0) > 0 && !order.order_filled_timestamp),
    )
  )
    cash = undefined;
  for (const post of [...result].sort(
    (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
  )) {
    const currency = post.impact?.quoteCurrency || post.pair.split('/')[1]?.split(':')[0];
    if (!stakeCurrency || currency !== stakeCurrency) continue;
    if (post.impact?.cashFlow === undefined) {
      cash = undefined; // Missing fills or unsupported margin cash movement break the ledger.
      continue;
    }
    if (cash !== undefined) {
      const next = cash + post.impact.cashFlow;
      if (next < -1e-8) {
        cash = undefined;
        continue;
      }
      post.impact.cashBefore = cash;
      post.impact.cashAfter = Math.max(0, next);
      cash = post.impact.cashAfter;
    }
  }
  return result;
}

/** Plain messages remain readable. Structured messages carry the strategy's own event time. */
export function strategyMessagePost(
  message: string,
  strategy: string,
  receivedAt: number,
): StrategyPost {
  let details: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(message);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      details = parsed as Record<string, unknown>;
  } catch {
    /* Plain strategy message. */
  }
  const timestamp = typeof details.timestamp === 'string' ? Date.parse(details.timestamp) : NaN;
  return {
    id:
      typeof details.id === 'string'
        ? `signal:${strategy}:${details.id}`
        : `signal:${crypto.randomUUID()}`,
    strategy,
    pair: typeof details.pair === 'string' ? details.pair : '',
    timestamp: Number.isFinite(timestamp) ? timestamp : receivedAt,
    receivedAt,
    kind: 'signal',
    source: 'strategy message',
    title: typeof details.title === 'string' ? details.title : 'Strategy update',
    message: typeof details.message === 'string' ? details.message : message,
  };
}
