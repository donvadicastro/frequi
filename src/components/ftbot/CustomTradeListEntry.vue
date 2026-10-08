<script setup lang="ts">
import type { Trade } from '@/types';

const props = withDefaults(
  defineProps<{
    trade: Trade;
    stakeCurrencyDecimals: number;
    showDetails?: boolean;
  }>(),
  { showDetails: false },
);
const quote = computed(
  () => props.trade.quote_currency || props.trade.pair.split('/')[1]?.split(':')[0] || '',
);
const base = computed(() => props.trade.base_currency || props.trade.pair.split('/')[0]);
const displayRate = computed(() =>
  props.trade.is_open ? props.trade.current_rate : props.trade.close_rate,
);
const pending = computed(() => props.trade.has_open_orders ?? Boolean(props.trade.open_order_id));
const profitTone = computed(() => {
  const value = props.trade.profit_ratio ?? props.trade.profit_abs;
  return value == null || value === 0 ? '' : value > 0 ? 'gain' : 'loss';
});
</script>

<template>
  <div class="position">
    <div class="position-heading">
      <div class="position-identity">
        <span class="asset-avatar" aria-hidden="true">{{ base?.slice(0, 2) }}</span>
        <div>
          <div class="pair-line">
            <strong>{{ trade.pair }}</strong>
            <span class="direction" :class="{ short: trade.is_short }">{{
              trade.is_short ? 'Short' : 'Long'
            }}</span>
            <span v-if="trade.leverage && trade.leverage > 1" class="leverage"
              >{{ trade.leverage }}×</span
            >
          </div>
          <div class="position-meta">
            <span>#{{ trade.trade_id }}</span>
            <span class="order-status" :class="{ pending }">{{
              !trade.is_open ? 'Closed' : pending ? 'Order pending' : 'Position open'
            }}</span>
          </div>
        </div>
      </div>
      <div class="position-profit" :class="profitTone">
        <span class="profit-label">{{ trade.is_open ? 'Current P&L' : 'Final P&L' }}</span>
        <strong>{{
          trade.profit_ratio !== null && trade.profit_ratio !== undefined
            ? formatPercent(trade.profit_ratio, 2)
            : '—'
        }}</strong>
        <span
          >{{
            trade.profit_abs !== undefined
              ? formatPrice(trade.profit_abs, stakeCurrencyDecimals)
              : '—'
          }}
          {{ quote }}</span
        >
      </div>
    </div>
    <dl class="position-facts">
      <div>
        <dt>Invested</dt>
        <dd>
          {{ formatPrice(trade.stake_amount, stakeCurrencyDecimals) }} <span>{{ quote }}</span>
        </dd>
      </div>
      <div>
        <dt>Quantity</dt>
        <dd>
          {{ formatPrice(trade.amount, 8) }} <span>{{ base }}</span>
        </dd>
      </div>
      <div>
        <dt>Entry price</dt>
        <dd>
          {{ formatPrice(trade.open_rate) }} <span>{{ quote }}</span>
        </dd>
      </div>
      <div>
        <dt>{{ trade.is_open ? 'Market price' : 'Exit price' }}</dt>
        <dd>
          {{ displayRate !== undefined ? formatPrice(displayRate!) : '—' }}
          <span>{{ quote }}</span>
        </dd>
      </div>
    </dl>
    <div class="position-footer">
      <span
        >{{ trade.close_timestamp ? 'Closed' : 'Opened' }}
        <DateTimeTZ :date="trade.close_timestamp || trade.open_timestamp"
      /></span>
      <span class="details-hint">View details <span aria-hidden="true">↗</span></span>
    </div>
  </div>
</template>

<style scoped>
.position {
  display: grid;
  grid-template-columns: minmax(160px, 1.4fr) minmax(0, 4fr) minmax(100px, 1fr);
  align-items: center;
  gap: 10px 20px;
  text-align: left;
}
.position-heading {
  display: contents;
}
.position-identity {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.asset-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 700;
}
.pair-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pair-line strong {
  font-size: 14px;
  color: var(--ui-text-highlighted);
  overflow-wrap: anywhere;
}
.direction {
  color: #187456;
  background: #edf8f2;
  border-radius: 5px;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 650;
}
.direction.short {
  color: #a34460;
  background: #fceef3;
}
.leverage {
  font-size: 11px;
  color: var(--ui-text-muted);
}
.position-meta {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  color: var(--ui-text-muted);
  font-size: 11px;
}
.order-status.pending {
  color: #a16b16;
}
.position-profit {
  grid-column: 3;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.profit-label {
  font-size: 10px;
  color: var(--ui-text-muted);
}
.position-profit strong {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.5px;
}
.position-profit > span:last-child {
  font-size: 11px;
}
.gain {
  color: var(--color-profit, #20835e);
}
.loss {
  color: var(--color-loss, #c14d60);
}
.position-facts {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.position-facts dt {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin-bottom: 4px;
}
.position-facts dd {
  font-size: 13px;
  font-weight: 550;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.position-facts dd span {
  font-size: 10px;
  font-weight: 400;
  color: var(--ui-text-muted);
}
.position-footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--ui-border);
  padding-top: 8px;
  font-size: 10px;
  color: var(--ui-text-muted);
}
.details-hint {
  white-space: nowrap;
  color: var(--ui-text-toned);
}
@media (max-width: 1000px) {
  .position {
    column-gap: 12px;
    grid-template-columns: minmax(130px, 1.3fr) minmax(0, 4fr) minmax(90px, 1fr);
  }
  .asset-avatar {
    display: none;
  }
  .position-facts {
    gap: 8px;
  }
  .position-facts dd {
    font-size: 12px;
  }
}
@media (max-width: 760px) {
  .position {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .position-profit {
    grid-column: 2;
  }
  .position-facts {
    grid-column: 1 / -1;
    grid-row: 2;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .position-footer {
    flex-wrap: wrap;
  }
}
</style>
