<script setup lang="ts">
import type { Trade } from '@/types';

defineProps<{
  trade: Trade;
  stakeCurrency: string;
}>();

const { showTradeCustomData } = useTradeCustomData();
</script>

<template>
  <div class="trade-detail">
    <header class="detail-header">
      <div>
        <div class="detail-eyebrow">
          TRADE #{{ trade.trade_id }} · {{ trade.is_open ? 'OPEN POSITION' : 'CLOSED POSITION' }}
        </div>
        <h2>
          {{ trade.pair }}
          <span class="direction" :class="{ short: trade.is_short }">{{
            trade.is_short ? 'Short' : 'Long'
          }}</span
          ><span v-if="trade.leverage && trade.leverage > 1" class="leverage"
            >{{ trade.leverage }}×</span
          >
        </h2>
        <p>Opened <DateTimeTZ :date="trade.open_timestamp" /></p>
      </div>
      <div class="headline-profit">
        <span>{{ trade.is_open ? 'Current P&L' : 'Final P&L' }}</span>
        <TradeProfit :trade="trade" />
      </div>
    </header>
    <div class="detail-grid">
      <section class="detail-panel">
        <div class="panel-heading">
          <h3>Position details</h3>
          <UButton
            size="sm"
            variant="outline"
            color="neutral"
            @click="showTradeCustomData({ tradeId: trade.trade_id })"
            label="Show custom data"
            icon="mdi:database-search"
          />
        </div>
        <ValuePair description="Trade Id">{{ trade.trade_id }}</ValuePair>
        <ValuePair description="Pair">{{ trade.pair }}</ValuePair>

        <ValuePair description="Open date">{{ timestampms(trade.open_timestamp) }}</ValuePair>
        <ValuePair v-if="trade.enter_tag" description="Entry tag">{{ trade.enter_tag }}</ValuePair>
        <ValuePair v-if="trade.is_open" description="Stake">
          {{ formatPriceCurrency(trade.stake_amount, stakeCurrency) }}
          <template v-if="trade.trading_mode !== 'spot'">
            ({{ trade.leverage }}x)
            <span title="Position value" class="italic">{{
              formatPriceCurrency(trade.amount * trade.open_rate, stakeCurrency)
            }}</span>
          </template>
        </ValuePair>
        <ValuePair v-if="!trade.is_open" description="Total Stake">
          {{ formatPriceCurrency(trade.max_stake_amount ?? trade.stake_amount, stakeCurrency) }}
          {{ trade.trading_mode !== 'spot' ? `(${trade.leverage}x)` : '' }}
        </ValuePair>
        <ValuePair description="Amount">{{ formatPrice(trade.amount) }}</ValuePair>
        <ValuePair description="Entry price">{{ formatPrice(trade.open_rate) }}</ValuePair>
        <ValuePair v-if="trade.is_open && trade.current_rate" description="Market price">
          {{ formatPrice(trade.current_rate) }}
          <span title="Current Value - In futures mode Collateral + PnL" class="italic">
            ({{ formatPriceCurrency(trade.stake_amount + (trade.profit_abs ?? 0), stakeCurrency) }})
          </span>
        </ValuePair>
        <ValuePair v-if="!trade.is_open && trade.close_rate" description="Exit price">{{
          formatPrice(trade.close_rate)
        }}</ValuePair>

        <ValuePair v-if="trade.close_timestamp" description="Close date">{{
          timestampms(trade.close_timestamp)
        }}</ValuePair>
        <ValuePair
          v-if="trade.is_open && trade.realized_profit && !trade.total_profit_abs"
          description="Realized Profit"
        >
          <TradeProfit :trade="trade" mode="realized" />
        </ValuePair>
        <ValuePair v-if="trade.is_open && trade.total_profit_abs" description="Total Profit">
          <TradeProfit :trade="trade" mode="total" />
        </ValuePair>
        <ValuePair
          v-if="trade.profit_ratio !== null || trade.profit_abs !== undefined"
          :description="`${trade.is_open ? 'Current Profit' : 'Close Profit'}`"
        >
          <TradeProfit :trade="trade" />
        </ValuePair>
        <BaseCollapsible title="Details" class="px-2 pb-2">
          <ValuePair v-if="trade.min_rate" description="Min Rate">{{
            formatPrice(trade.min_rate)
          }}</ValuePair>
          <ValuePair v-if="trade.max_rate" description="Max Rate">{{
            formatPrice(trade.max_rate)
          }}</ValuePair>
          <ValuePair description="Open-Fees">
            {{ trade.fee_open_cost }} {{ trade.quote_currency }}
            <span v-if="trade.quote_currency !== trade.fee_open_currency">
              (in {{ trade.fee_open_currency }})
            </span>
            ({{ formatPercent(trade.fee_open) }})
          </ValuePair>
          <ValuePair v-if="trade.fee_close_cost && trade.fee_close" description="Fees close">
            {{ trade.fee_close_cost }} {{ trade.fee_close_currency }} ({{
              formatPercent(trade.fee_close)
            }})
          </ValuePair>
        </BaseCollapsible>
      </section>
      <section class="detail-panel">
        <div class="panel-heading"><h3>Risk &amp; protection</h3></div>
        <ValuePair description="Stoploss">
          {{ formatPercent(trade.stop_loss_ratio) }} |
          {{ formatPrice(trade.stop_loss_abs) }}
        </ValuePair>
        <ValuePair
          description="At risk"
          help="The amount at risk based on the stake amount. This is how much you would lose if the stoploss is hit."
        >
          {{
            formatPriceCurrency(trade.stake_amount * Math.abs(trade.stop_loss_ratio), stakeCurrency)
          }}
        </ValuePair>
        <ValuePair
          v-if="trade.is_open && trade.stoploss_current_dist_ratio && trade.stoploss_current_dist"
          description="Distance to stoploss"
        >
          {{ formatPercent(trade.stoploss_current_dist_ratio) }} |
          {{ formatPrice(trade.stoploss_current_dist) }}
        </ValuePair>
        <ValuePair
          v-if="trade.initial_stop_loss_pct && trade.initial_stop_loss_abs"
          description="Initial Stoploss"
        >
          {{ formatPercent(trade.initial_stop_loss_pct / 100) }} |
          {{ formatPrice(trade.initial_stop_loss_abs) }}
        </ValuePair>
        <ValuePair v-if="trade.stoploss_last_update_timestamp" description="Stoploss last updated">
          {{ timestampms(trade.stoploss_last_update_timestamp) }}
        </ValuePair>
        <div v-if="trade.trading_mode !== undefined && trade.trading_mode !== 'spot'">
          <h3 class="subsection-heading">Futures / margin</h3>
          <ValuePair description="Direction">
            {{ trade.is_short ? 'short' : 'long' }} - {{ trade.leverage }}x
          </ValuePair>
          <ValuePair
            v-if="trade.funding_fees !== undefined"
            description="Funding fees"
            help="Positive funding_fees -> Trade has gained from fees. Negative funding_fees -> Trade had to pay the fees."
          >
            {{ formatDecimal(trade.funding_fees) }}
          </ValuePair>
          <ValuePair v-if="trade.interest_rate !== undefined" description="Interest rate">
            {{ formatDecimal(trade.interest_rate) }}
          </ValuePair>
          <ValuePair v-if="trade.liquidation_price !== undefined" description="Liquidation Price">
            {{ formatPrice(trade.liquidation_price) }}
          </ValuePair>
        </div>
      </section>
    </div>
    <section class="detail-panel order-history">
      <div class="panel-heading">
        <div>
          <h3>
            Order history <span class="order-count">{{ trade.orders?.length ?? 0 }}</span>
          </h3>
          <p>Entries and exits for this position.</p>
        </div>
      </div>
      <div v-if="trade.orders?.length" class="orders-scroll">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Side</th>
              <th>Status</th>
              <th>Price</th>
              <th>Filled quantity</th>
              <th>Remaining</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(order, index) in trade.orders" :key="order.order_id || index">
              <td>
                <strong>{{ order.ft_is_entry ? 'Entry' : 'Exit' }}</strong
                ><small
                  >#{{ index + 1 }} · {{ order.order_type
                  }}<template v-if="order.ft_order_tag">
                    · {{ order.ft_order_tag }}</template
                  ></small
                >
              </td>
              <td>
                <span class="order-side" :class="{ sell: order.ft_order_side !== 'buy' }">{{
                  order.ft_order_side
                }}</span>
              </td>
              <td>
                <span class="order-state" :class="{ pending: order.is_open }">{{
                  order.status || (order.is_open ? 'Open' : 'Closed')
                }}</span>
              </td>
              <td>
                {{ formatPrice(order.safe_price) }}
                <small>{{ trade.quote_currency || stakeCurrency }}</small>
              </td>
              <td>
                {{ formatPrice(order.filled ?? 0, 8) }}
                <small>of {{ formatPrice(order.amount, 8) }} {{ trade.base_currency }}</small>
              </td>
              <td>{{ order.remaining !== null ? formatPrice(order.remaining, 8) : '—' }}</td>
              <td>
                <DateTimeTZ
                  v-if="order.order_timestamp"
                  :date="order.order_timestamp"
                  show-timezone
                /><span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty-orders">No orders reported for this position.</p>
    </section>
  </div>
</template>

<style scoped>
.trade-detail {
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;
  text-align: left;
  color: var(--ui-text);
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 22px 4px 26px;
}
.detail-eyebrow {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.8px;
  color: var(--ui-text-muted);
}
.detail-header h2 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 25px;
  font-weight: 650;
  margin: 8px 0;
  color: var(--ui-text-highlighted);
}
.detail-header p {
  font-size: 11px;
  color: var(--ui-text-muted);
}
.direction,
.order-side {
  display: inline-block;
  color: #187456;
  background: #edf8f2;
  border-radius: 5px;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 650;
}
.direction.short,
.order-side.sell {
  color: #a34460;
  background: #fceef3;
}
.leverage {
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 400;
}
.headline-profit {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.headline-profit > span {
  font-size: 11px;
  color: var(--ui-text-muted);
}
.headline-profit :deep(> div) {
  padding: 8px 12px;
  border-width: 1px;
  border-radius: 8px;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}
.detail-panel {
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  border-radius: 12px;
  padding: 20px;
  min-width: 0;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--ui-border);
  padding-bottom: 15px;
  margin-bottom: 10px;
}
.panel-heading h3,
.subsection-heading {
  font-size: 14px;
  font-weight: 650;
  color: var(--ui-text-highlighted);
}
.panel-heading p {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin-top: 5px;
}
.subsection-heading {
  border-top: 1px solid var(--ui-border);
  padding-top: 20px;
  margin: 16px 0 10px;
}
.detail-panel :deep(.flex.w-full) {
  padding: 9px 0;
  font-size: 12px;
  line-height: 1.6;
  gap: 12px;
}
.detail-panel :deep(.flex.w-full > div:first-child) {
  width: 43%;
  flex-shrink: 0;
  margin: 0;
  color: var(--ui-text-muted);
  font-weight: 400;
}
.detail-panel :deep(.flex.w-full > div:last-child) {
  flex: 1;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.detail-panel :deep(.italic) {
  display: block;
  font-size: 10px;
  color: var(--ui-text-muted);
  font-style: normal;
}
.order-history {
  margin-top: 18px;
}
.order-count {
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  font-size: 11px;
}
.orders-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}
th {
  padding: 10px 12px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  font-weight: 500;
  font-size: 10px;
  white-space: nowrap;
}
td {
  padding: 14px 12px;
  border-bottom: 1px solid var(--ui-border);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
tr:last-child td {
  border-bottom: 0;
}
td strong {
  font-weight: 550;
}
td small {
  display: block;
  margin-top: 3px;
  color: var(--ui-text-muted);
  font-size: 10px;
}
.order-state {
  font-size: 11px;
  text-transform: capitalize;
  color: var(--ui-text-muted);
}
.order-state.pending {
  color: #a16b16;
}
.empty-orders {
  padding: 24px 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}
@media (max-width: 850px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
  .detail-panel {
    padding: 16px;
  }
}
@media (max-width: 500px) {
  .detail-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .headline-profit {
    align-items: flex-start;
  }
}
</style>
