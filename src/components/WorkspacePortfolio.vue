<script setup lang="ts">
import type { WalletHistoryPerBot } from '@/types';
import { aggregateWalletHistory } from '@/utils/portfolioHistory';
import { tradingMode, type TradingMode } from '@/utils/tradingMode';
const props = defineProps<{ botId?: string; mode?: TradingMode }>();
const bots = useBotStore();
const loading = ref(false);
const view = ref('total');
const stores = computed(() =>
  props.botId
    ? [bots.botStores[props.botId]].filter((bot) => !!bot)
    : bots.allBotStores.filter((bot) => !props.mode || tradingMode(bot.botState) === props.mode),
);
const groups = computed(() => {
  const currencies = [...new Set(stores.value.map((bot) => bot.stakeCurrency).filter(Boolean))];
  return currencies.map((currency) => {
    const members = stores.value.filter((bot) => bot.stakeCurrency === currency);
    const histories: WalletHistoryPerBot = {};
    members.forEach((bot) => {
      const history = bot.balanceHistory;
      if (
        history &&
        Array.isArray(history.data) &&
        history.data.length &&
        history.columns?.includes('__date_ts') &&
        history.columns.includes('total_quote')
      )
        histories[bot.$id] = { ...history, botName: bot.uiBotName };
    });
    const aggregate = aggregateWalletHistory(Object.values(histories));
    const first = aggregate?.data[0]?.[1] as number | undefined;
    const last = aggregate?.data.at(-1)?.[1] as number | undefined;
    return {
      currency,
      members,
      histories,
      aggregate,
      first,
      last,
      change: first !== undefined && last !== undefined ? last - first : undefined,
    };
  });
});
const number = (value: number | undefined) =>
  value === undefined ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    await Promise.allSettled(stores.value.map((bot) => bot.updateWalletChange()));
  } finally {
    loading.value = false;
  }
}
watch(
  () => [props.botId, ...stores.value.map((bot) => `${bot.$id}:${bot.botFeatures.walletChange}`)],
  refresh,
  { immediate: true },
);
</script>

<template>
  <div class="portfolio-history">
    <header class="history-header">
      <div>
        <h2>
          {{
            mode
              ? mode === 'live'
                ? 'Live portfolio'
                : 'Dry-run portfolio'
              : 'Portfolio over time'
          }}
        </h2>
        <p>
          Historical wallet balances reported by
          {{
            botId
              ? 'this strategy'
              : mode === 'live'
                ? 'live strategies'
                : mode === 'dry_run'
                  ? 'dry-run strategies'
                  : 'your strategies'
          }}.
        </p>
      </div>
      <button type="button" :disabled="loading" @click="refresh">
        {{ loading ? 'Refreshing…' : 'Refresh history' }}
      </button>
    </header>
    <div v-if="!botId && stores.length > 1" class="history-views" aria-label="Portfolio chart view">
      <button
        type="button"
        :class="{ selected: view === 'total' }"
        :aria-pressed="view === 'total'"
        @click="view = 'total'"
      >
        Total portfolio
      </button>
      <button
        type="button"
        :class="{ selected: view === 'strategies' }"
        :aria-pressed="view === 'strategies'"
        @click="view = 'strategies'"
      >
        By strategy
      </button>
    </div>
    <section v-for="group in groups" :key="group.currency" class="history-panel">
      <div class="history-heading">
        <h3>{{ group.currency }} portfolio</h3>
        <span
          >{{ Object.keys(group.histories).length }} / {{ group.members.length }} strategies with
          history</span
        >
      </div>
      <dl v-if="group.aggregate" class="history-stats">
        <div>
          <dt>First recorded balance</dt>
          <dd>
            {{ number(group.first) }} <small>{{ group.currency }}</small>
          </dd>
        </div>
        <div>
          <dt>Last recorded balance</dt>
          <dd>
            {{ number(group.last) }} <small>{{ group.currency }}</small>
          </dd>
        </div>
        <div>
          <dt>Change over recorded period</dt>
          <dd :class="{ gain: (group.change ?? 0) > 0, loss: (group.change ?? 0) < 0 }">
            {{ number(group.change) }} <small>{{ group.currency }}</small>
          </dd>
        </div>
      </dl>
      <div
        v-if="view === 'strategies' ? Object.keys(group.histories).length : group.aggregate"
        class="history-chart"
      >
        <WalletHistoryChart
          :wallet-data="view === 'strategies' ? group.histories : { portfolio: group.aggregate! }"
          :show-title="false"
        />
      </div>
      <p v-else class="history-empty">
        {{
          loading
            ? 'Loading wallet history…'
            : Object.keys(group.histories).length
              ? 'These strategies do not yet have an overlapping history period. Use By strategy to inspect each one.'
              : 'No historical wallet balances are available yet. The bot must support and record wallet history.'
        }}
      </p>
      <p v-if="Object.keys(group.histories).length < group.members.length" class="history-note">
        Strategies without wallet history are excluded from this chart.
      </p>
      <p v-if="group.aggregate" class="history-note">
        Totals use the shared recorded period, carrying the last recorded balance between samples.
        Balance changes include deposits and withdrawals as well as trading results.
      </p>
    </section>
    <div v-if="!stores.length" class="history-panel history-empty">
      {{
        mode
          ? `No ${mode === 'live' ? 'live' : 'dry-run'} strategies connected.`
          : 'Connect a strategy to see its portfolio history.'
      }}
      <RouterLink to="/login">Connect an agent →</RouterLink>
    </div>
    <div v-else-if="!groups.length" class="history-panel history-empty">
      Waiting for the bots to report their stake currencies.
    </div>
    <div v-for="group in groups" :key="`holdings-${group.currency}`" class="history-panel">
      <HoldingsHistoryChart :bots="group.members" :currency="group.currency" />
    </div>
    <BotBalance v-if="botId" class="current-holdings" />
    <slot />
  </div>
</template>

<style scoped>
.portfolio-history {
  max-width: 1120px;
  margin: 0 auto;
  color: var(--ui-text);
}
.history-header,
.history-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.history-header {
  margin-bottom: 20px;
}
h2 {
  font-size: 21px;
  font-weight: 650;
  color: var(--ui-text-highlighted);
}
.history-header p {
  color: var(--ui-text-muted);
  font-size: 12px;
  margin-top: 6px;
}
.history-header button {
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  padding: 8px 12px;
  font-size: 11px;
  white-space: nowrap;
}
button:disabled {
  opacity: 0.6;
}
.history-views {
  display: flex;
  gap: 6px;
  margin-bottom: 18px;
}
.history-views button {
  padding: 8px 12px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.history-views .selected {
  background: #edf0fc;
  color: #5267b5;
}
.history-panel {
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  padding: 20px;
  background: var(--ui-bg);
  margin-bottom: 18px;
}
h3 {
  font-size: 14px;
  font-weight: 600;
}
.history-heading > span {
  font-size: 10px;
  color: var(--ui-text-muted);
}
.history-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin: 22px 0;
}
dt {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin-bottom: 8px;
}
dd {
  font-size: 23px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
dd small {
  font-size: 11px;
  color: var(--ui-text-muted);
  font-weight: 400;
}
.gain {
  color: #20835e;
}
.loss {
  color: #bf4657;
}
.history-chart {
  height: 360px;
}
.history-note {
  font-size: 10px;
  color: var(--ui-text-muted);
  margin-top: 12px;
  line-height: 1.7;
}
.history-empty {
  padding: 40px 20px;
  font-size: 12px;
  color: var(--ui-text-muted);
  line-height: 1.8;
}
.history-empty a {
  display: block;
  color: #5267b5;
  margin-top: 8px;
}
.current-holdings {
  margin-top: 28px;
}
button:focus-visible {
  outline: 2px solid #637acb;
  outline-offset: 3px;
}
@media (max-width: 680px) {
  .history-header,
  .history-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .history-stats {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .history-panel {
    padding: 15px;
  }
  .history-chart {
    height: 280px;
  }
}
</style>
