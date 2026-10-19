<script setup lang="ts">
import ECharts from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { format as echartsFormat, type EChartsOption } from 'echarts';
import type { BotSubStore } from '@/stores/ftbotwrapper';
import type { AllocationSource } from '@/utils/allocationHistory';
import { buildAllocationHistory } from '@/utils/allocationHistory';
import { isApiError } from '@/composables/api';

use([
  CanvasRenderer,
  LineChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
]);
const props = defineProps<{ bots: BotSubStore[]; currency: string }>();
const loading = ref(false);
const error = ref('');
const sources = shallowRef<AllocationSource[]>([]);
let request = 0;
const history = computed(() => buildAllocationHistory(sources.value));
const hasData = computed(
  () => history.value.points.filter((point) => !('gap' in point)).length >= 2,
);
const latest = computed(() =>
  [...history.value.points].reverse().find((point) => !('gap' in point)),
);
const settings = useSettingsStore();
const route = useRoute();
const theme = computed(() => (route.path === '/' ? 'light' : settings.chartTheme));
const palette = [
  '#14b8a6',
  '#ec4899',
  '#8b5cf6',
  '#0ea5e9',
  '#84cc16',
  '#f97316',
  '#d946ef',
  '#eab308',
  '#06b6d4',
  '#f43f5e',
  '#10b981',
  '#a78bfa',
];
const color = (asset: string, index: number) =>
  asset === props.currency
    ? '#94a3b8'
    : asset === 'BTC'
      ? '#f59e0b'
      : asset === 'ETH'
        ? '#6366f1'
        : palette[index % palette.length];
const label = (asset: string) => (asset === props.currency ? `${asset} (cash)` : asset);
const sourceKey = computed(() =>
  props.bots
    .map(
      (bot) =>
        `${bot.$id}:${bot.botState.strategy}:${bot.timeframe}:${bot.allTrades.map((trade) => `${trade.trade_id}:${trade.orders?.map((order) => order.order_filled_timestamp ?? 0).join(',')}`).join(';')}`,
    )
    .join('|'),
);
async function refresh() {
  const current = ++request;
  const bots = [...props.bots];
  loading.value = true;
  error.value = '';
  try {
    await Promise.all(
      bots.flatMap((bot) => [
        ...(!bot.allTrades.length ? [bot.getTrades()] : []),
        ...(bot.balance.starting_capital === undefined ? [bot.getBalance()] : []),
      ]),
    );
    if (current !== request) return;
    const next = bots.map((bot): AllocationSource => ({
      id: bot.$id,
      currency: bot.stakeCurrency,
      startingCash: bot.balance.starting_capital,
      trades: bot.allTrades,
      prices: {},
    }));
    const jobs: (() => Promise<void>)[] = [];
    let missing = false;
    let missingReason = '';
    bots.forEach((bot, index) => {
      const first = Math.min(
        ...bot.allTrades.map((trade) => trade.open_timestamp).filter(Number.isFinite),
      );
      if (!Number.isFinite(first) || bot.botState.trading_mode === 'futures') return;
      const timerange = `${Math.floor(first / 1000) - 86400}-${Math.floor(Date.now() / 1000)}`;
      for (const pair of new Set(bot.allTrades.map((trade) => trade.pair))) {
        jobs.push(async () => {
          try {
            const data = await bot.getAllocationCandles(pair, timerange);
            if (!Array.isArray(data.data) || !data.columns?.includes('close'))
              throw new Error('No historical closes returned');
            next[index]!.prices[pair] = data;
          } catch (failure) {
            missing = true;
            if (!missingReason)
              missingReason = `${pair}: ${isApiError(failure) ? String(failure.data?.detail || failure.data?.error || failure.statusMessage) : failure instanceof Error ? failure.message : 'Unavailable'}`;
          }
        });
      }
    });
    // Limit concurrent analysis requests; don't overload the bot with one call per holding.
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, jobs.length) }, async () => {
        while (cursor < jobs.length && current === request) await jobs[cursor++]!();
      }),
    );
    if (current !== request) return;
    sources.value = next;
    if (missing) error.value = `Historical prices unavailable for ${missingReason}.`;
  } catch {
    if (current === request) error.value = 'Could not load holdings history. Try refreshing.';
  } finally {
    if (current === request) loading.value = false;
  }
}
watch(sourceKey, refresh, { immediate: true });
onBeforeUnmount(() => {
  request++;
});
const options = computed<EChartsOption>(() => ({
  animation: false,
  backgroundColor: 'transparent',
  useUTC: true,
  grid: { left: 48, right: 18, top: 48, bottom: 65 },
  legend: {
    top: 0,
    type: 'scroll',
    selectedMode: false,
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 8,
    textStyle: { fontSize: 11 },
  },
  xAxis: {
    type: 'time',
    boundaryGap: [0, 0],
    axisLabel: { fontSize: 10 },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    interval: 25,
    axisLabel: { formatter: '{value}%', fontSize: 10 },
    splitLine: { lineStyle: { color: theme.value === 'dark' ? '#334155' : '#edf0f5' } },
  },
  tooltip: {
    trigger: 'axis',
    appendTo: 'body',
    confine: true,
    formatter: (params) => {
      const items = Array.isArray(params) ? params : [params];
      const first = items[0] as { data?: [number, number | null] } | undefined;
      if (!first?.data) return '';
      const timestamp = Number(first.data[0]);
      const point = history.value.points.find((point) => point.timestamp === timestamp);
      if (!point || 'gap' in point) return 'Historical prices unavailable';
      const lines = history.value.assets
        .filter((asset) => (point.percentages[asset] ?? 0) > 0)
        .map(
          (asset) =>
            `${echartsFormat.encodeHTML(label(asset))}: <b>${(point.percentages[asset] ?? 0).toFixed(1)}%</b> · ${point.values[asset]!.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${echartsFormat.encodeHTML(props.currency)}`,
        );
      return `${new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19)} UTC<br/>${lines.join('<br/>')}`;
    },
  },
  dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 8, height: 20, showDetail: false }],
  series: history.value.assets.map((asset, index) => ({
    name: label(asset),
    type: 'line',
    stack: 'holdings',
    showSymbol: false,
    smooth: false,
    connectNulls: false,
    color: color(asset, index),
    lineStyle: { width: 0 },
    areaStyle: { opacity: 0.9 },
    emphasis: { focus: 'series' },
    data: history.value.points.map((point) => [
      point.timestamp,
      'gap' in point ? null : (point.percentages[asset] ?? 0),
    ]),
  })),
}));
</script>

<template>
  <section class="holdings-history" aria-label="Holdings allocation over time">
    <header>
      <div>
        <h3>Holdings over time</h3>
        <p>Share of portfolio value in {{ currency }} · 0–100%</p>
      </div>
      <button type="button" :disabled="loading" @click="refresh">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </header>
    <div v-if="loading" class="chart-placeholder" role="status">
      Loading holdings and historical prices…
    </div>
    <div v-else-if="hasData" class="allocation-chart">
      <ECharts :option="options" :theme="theme" autoresize />
    </div>
    <p v-else class="chart-placeholder">
      {{ error || history.warning || 'Not enough historical prices to chart holdings yet.' }}
    </p>
    <p v-if="hasData" class="chart-note">
      Reconstructed from spot fills and historical prices, before fees and transfers. Each point
      totals 100%. Hover to see percentages and values.
    </p>
    <p v-if="hasData && (error || history.warning)" class="chart-note">
      {{ error || history.warning }}
    </p>
    <ul
      v-if="latest && !('gap' in latest)"
      class="sr-only"
      aria-label="Latest allocation percentages"
    >
      <li v-for="asset in history.assets" :key="asset">
        {{ label(asset) }}: {{ (latest.percentages[asset] ?? 0).toFixed(2) }}%
      </li>
    </ul>
  </section>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
h3 {
  font-size: 14px;
  font-weight: 600;
}
header p {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin-top: 5px;
}
button {
  font-size: 11px;
  color: #5267b5;
  cursor: pointer;
}
button:hover {
  text-decoration: underline;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.allocation-chart {
  height: 340px;
}
.echarts {
  width: 100%;
  height: 100%;
}
.chart-placeholder {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.chart-note {
  font-size: 10px;
  line-height: 1.7;
  color: var(--ui-text-muted);
  margin-top: 10px;
}
@media (max-width: 680px) {
  .allocation-chart {
    height: 280px;
  }
}
</style>
