<script setup lang="ts">
import type { Trade } from '@/types';

const props = withDefaults(
  defineProps<{
    trades: Trade[];
    title?: string;
    stakeCurrency?: string;
    activeTrades?: boolean;
    showFilter?: boolean;
    multiBotView?: boolean;
    emptyText?: string;
    stakeCurrencyDecimals?: number;
  }>(),
  {
    title: 'Trades',
    stakeCurrency: '',
    activeTrades: false,
    showFilter: false,
    multiBotView: false,
    emptyText: 'No trades to show.',
    stakeCurrencyDecimals: 3,
  },
);
const botStore = useBotStore();
const currentPage = ref(1);
const filterText = ref('');
const perPage = computed(() => (props.activeTrades ? 200 : 25));
const matchingTrades = computed(() => {
  const query = filterText.value.trim().toLowerCase();
  return props.trades.filter(
    (trade) =>
      !query ||
      `${trade.pair} ${trade.trade_id} ${trade.is_short ? 'short' : 'long'}`
        .toLowerCase()
        .includes(query),
  );
});
const filteredTrades = computed(() =>
  matchingTrades.value.slice(
    (currentPage.value - 1) * perPage.value,
    currentPage.value * perPage.value,
  ),
);
const pendingCount = computed(
  () =>
    props.trades.filter((trade) => trade.has_open_orders ?? Boolean(trade.open_order_id)).length,
);
const winningCount = computed(
  () => props.trades.filter((trade) => (trade.profit_ratio ?? trade.profit_abs ?? 0) > 0).length,
);
watch(filterText, () => {
  currentPage.value = 1;
});
watch(
  () => matchingTrades.value.length,
  (count) => {
    currentPage.value = Math.min(currentPage.value, Math.max(1, Math.ceil(count / perPage.value)));
  },
);
const tradeClick = (trade: Trade) => botStore.activeBot.setDetailTrade(trade);
</script>

<template>
  <section class="positions-view" :aria-label="title">
    <header class="positions-header">
      <div>
        <h2>
          {{ title }} <span class="count-badge">{{ trades.length }}</span>
        </h2>
        <p>
          {{
            activeTrades
              ? 'Your active positions and pending orders. Select a position to inspect its orders.'
              : 'Completed positions and their results. Select a position for the full history.'
          }}
        </p>
      </div>
      <label v-if="activeTrades || showFilter || trades.length" class="position-search"
        ><span class="sr-only">Search positions</span
        ><input v-model="filterText" type="search" placeholder="Search pair, ID or direction…"
      /></label>
    </header>
    <div v-if="activeTrades && trades.length" class="position-summary">
      <span
        ><strong>{{ trades.length }}</strong> open positions</span
      >
      <span
        ><strong>{{ pendingCount }}</strong> with pending orders</span
      >
      <span
        ><strong>{{ winningCount }}</strong> in profit</span
      >
    </div>
    <div id="tradeList" class="position-list">
      <button
        v-for="trade in filteredTrades"
        :key="trade.botTradeId || trade.trade_id"
        type="button"
        class="position-card"
        :aria-label="`View ${trade.pair} ${trade.is_short ? 'short' : 'long'} position ${trade.trade_id}`"
        @click="tradeClick(trade)"
      >
        <CustomTradeListEntry :trade="trade" :stake-currency-decimals="stakeCurrencyDecimals" />
      </button>
    </div>
    <div v-if="!matchingTrades.length" class="positions-empty">
      <span aria-hidden="true" class="empty-symbol">≋</span>
      <h3>
        {{
          trades.length
            ? 'No matching positions'
            : activeTrades
              ? 'No open positions'
              : 'No trade history yet'
        }}
      </h3>
      <p>{{ trades.length ? 'Try another pair, trade ID or direction.' : emptyText }}</p>
      <button v-if="filterText" type="button" @click="filterText = ''">Clear search</button>
    </div>
    <UPagination
      v-if="matchingTrades.length > perPage"
      v-model:page="currentPage"
      class="mt-5"
      :total="matchingTrades.length"
      :items-per-page="perPage"
      aria-controls="tradeList"
    />
  </section>
</template>

<style scoped>
.positions-view {
  max-width: 1120px;
  margin: 0 auto;
  padding: 8px;
  color: var(--ui-text);
  text-align: left;
}
.positions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  margin-bottom: 22px;
}
.positions-header h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 21px;
  font-weight: 650;
  color: var(--ui-text-highlighted);
}
.count-badge {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
}
.positions-header p {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.7;
  margin-top: 6px;
  max-width: 500px;
}
.position-search {
  flex-shrink: 0;
}
.position-search input {
  width: 240px;
  max-width: 100%;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 12px;
}
.position-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 26px;
  padding: 14px 18px;
  margin-bottom: 18px;
  border-radius: 10px;
  background: var(--ui-bg-elevated);
  font-size: 12px;
  color: var(--ui-text-muted);
}
.position-summary strong {
  color: var(--ui-text-highlighted);
  margin-right: 4px;
  font-variant-numeric: tabular-nums;
}
.position-list {
  display: grid;
  gap: 8px;
}
.position-card {
  display: block;
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg);
  padding: 12px 16px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.position-card:hover {
  border-color: var(--ui-primary);
  box-shadow: 0 4px 16px #18243a08;
}
.position-card:focus-visible,
.position-search input:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 3px;
}
.positions-empty {
  text-align: center;
  padding: 64px 20px;
  border: 1px dashed var(--ui-border);
  border-radius: 12px;
}
.empty-symbol {
  display: inline-grid;
  place-items: center;
  width: 48px;
  height: 48px;
  background: var(--ui-bg-elevated);
  border-radius: 14px;
  color: var(--ui-text-muted);
  font-size: 28px;
  margin-bottom: 16px;
}
.positions-empty h3 {
  font-size: 16px;
  font-weight: 600;
}
.positions-empty p {
  font-size: 12px;
  color: var(--ui-text-muted);
  margin-top: 8px;
}
.positions-empty button {
  margin-top: 18px;
  color: var(--ui-primary);
  font-size: 12px;
}
@media (max-width: 760px) {
  .positions-header {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .position-search input {
    width: 100%;
  }
  .position-card {
    padding: 16px;
  }
  .positions-view {
    padding: 0;
  }
}
</style>
